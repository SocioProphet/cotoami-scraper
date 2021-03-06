<template>
  <div id="kindle-highlights-scraper">
    <div id="error" v-if="error">{{ error }}</div>
    <div id="posted" v-else-if="posted">
      <img src="../../images/done.gif"> Posted.
    </div>
    <div id="scraped" v-else-if="scraped">
      <div id="scraped-content">
        <div class="message">
          <span class="count">{{ annotations.length }}</span> highlights will be posted to:
        </div>
        <cotonoma-name-input v-bind:cotoami-url="cotoamiUrl" v-model="cotonomaName"></cotonoma-name-input>
        <div class="annotations">
          <div class="coto" v-for="(annotation, index) in annotations" v-bind:key="annotation.id">
            <div class="number">{{ index + 1 }}.</div>
            <blockquote class="highlight" v-if="annotation.highlight">{{ annotation.highlight }}</blockquote>
            <div class="note" v-if="annotation.note">{{ annotation.note }}</div>
            <a
              v-bind:href="makeAnnotationUrl(annotation)"
              target="_blank"
            >{{ title }} - {{ annotation.location }}</a>
          </div>
        </div>
      </div>
      <div class="buttons">
        <button class="button" v-on:click="cancel()" v-if="!posting">Cancel</button>
        <button
          class="button button-primary"
          v-on:click="post()"
          v-bind:disabled="posting"
        >{{ posting ? `Posting... ${postCount} / ${annotations.length}` : 'Post' }}</button>
      </div>
    </div>
    <div id="scaping" v-else-if="scaping">
      <img src="../../images/loading.gif">
      Scaping...
    </div>
  </div>
</template>

<script>
import "whatwg-fetch";
import _ from "lodash";
import cheerio from "cheerio";
import Utils from "../../js/Utils.js";
import CotonomaNameInput from "./CotonomaNameInput.vue";

const _codeToScrapeBasicInfo = `
  var asin = document.getElementById('kp-notebook-annotations-asin').getAttribute('value');
  var deviceType = window.KindleGlobal ? window.KindleGlobal.amazonDeviceType : 'A2CLFWBIMVSE9N';
  [asin, deviceType]
`;

const _initialHighlightsUrl = (hostname, deviceType, asin) =>
  `https://${hostname}/kp/notebook?purpose=NOTEBOOK&amazonDeviceType=${deviceType}&appName=notebook&asin=${asin}&contentLimitState=&`;

const _nextHighlightsUrl = (hostname, asin, limitState, token, index) =>
  `https://${hostname}/kp/notebook?asin=${asin}&contentLimitState=${limitState}&token=${token}&index=${index}`;

const _scrapePageInfo = $ => {
  return [
    $("input.kp-notebook-content-limit-state").val(),
    $("input.kp-notebook-annotations-next-page-start").val()
  ];
};

const _scrapeAnnotations = ($, annotationDivs) => {
  let annotations = [];
  $(annotationDivs).each(function(index, element) {
    const id = $(this).attr("id");
    const note = $(this)
      .find("span#note")
      .text()
      .trim();
    const highlight = $(this)
      .find("span#highlight")
      .text()
      .trim();
    const location = $(this)
      .find("input#kp-annotation-location")
      .val();
    if (location) {
      annotations.push({
        id: id,
        note: note && note !== "" ? note : null,
        highlight: highlight && highlight !== "" ? highlight : null,
        location: location
      });
    }
  });
  return annotations;
};

const _finishScrapedAnnotations = annotations => {
  annotations = _.filter(annotations, a => !_.isNil(a.location));
  return _.uniqWith(annotations, _.isEqual);
};

export default {
  props: ["cotoamiUrl"],

  components: {
    CotonomaNameInput
  },

  data() {
    return {
      hostname: null,
      deviceType: null,
      asin: null,
      title: "",
      cotonomaName: "",
      annotations: null,
      scaping: false,
      scraped: false,
      posting: false,
      postCount: 0,
      posted: false,
      error: null
    };
  },

  methods: {
    scrape() {
      this.scaping = true;
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        this.hostname = new URL(tabs[0].url).hostname;
        chrome.tabs.executeScript(
          tabs[0].id,
          { code: _codeToScrapeBasicInfo },
          ([[asin, deviceType]]) => {
            if (asin) {
              this.asin = asin;
              this.deviceType = deviceType;
              this.doScrape();
            } else {
              this.scraped = true;
              this.scaping = false;
              this.error = "Couldn't get the ASIN.";
            }
          }
        );
      });
    },

    doScrape() {
      const url = _initialHighlightsUrl(
        this.hostname,
        this.deviceType,
        this.asin
      );
      fetch(url, { credentials: "include" })
        .then(Utils.checkStatusAndGetTextBody.bind(Utils))
        .then(html => {
          const $ = cheerio.load(html);
          this.title = $("h3.kp-notebook-metadata").text();
          this.cotonomaName = _.truncate(this.title, { length: 50 });
          const [contentLimitState, nextPageStartToken] = _scrapePageInfo($);
          const annotations = _scrapeAnnotations(
            $,
            $("#kp-notebook-annotations > div")
          );
          this.scrapeNextPage(
            contentLimitState,
            nextPageStartToken,
            annotations
          );
        })
        .catch(error => {
          this.error = error;
        });
    },

    scrapeNextPage(contentLimitState, nextPageStartToken, annotations) {
      if (nextPageStartToken) {
        const url = _nextHighlightsUrl(
          this.hostname,
          this.asin,
          contentLimitState,
          nextPageStartToken,
          annotations.length
        );
        fetch(url, { credentials: "include" })
          .then(Utils.checkStatusAndGetTextBody.bind(Utils))
          .then(html => {
            const $ = cheerio.load(html);
            const [contentLimitState, nextPageStartToken] = _scrapePageInfo($);
            const nextAnnotations = _scrapeAnnotations(
              $,
              $("div.a-row.a-spacing-base")
            );
            this.scrapeNextPage(
              contentLimitState,
              nextPageStartToken,
              annotations.concat(nextAnnotations)
            );
          });
      } else {
        this.annotations = _finishScrapedAnnotations(annotations);
        this.scraped = true;
        this.scaping = false;
      }
    },

    cancel() {
      this.$emit("cancel");
    },

    makeAnnotationUrl(annotation) {
      return `kindle://book?action=open&asin=${this.asin}&location=${
        annotation.location
      }`;
    },

    markdown(annotation) {
      const url = this.makeAnnotationUrl(annotation);
      return (
        (annotation.highlight ? `> ${annotation.highlight} \n \n` : "") +
        (annotation.note ? `${annotation.note} \n \n` : "") +
        `[${this.title} - ${annotation.location}](${url})`
      );
    },

    post() {
      this.posting = true;
      Utils.getOrCreateCotonoma(
        this.cotoamiUrl,
        this.cotonomaName,
        cotonomaId => {
          _.reduce(
            this.annotations,
            (promise, annotation) => {
              return promise.then(response => {
                if (response) this.postCount++;
                const content = this.markdown(annotation);
                return Utils.postCoto(this.cotoamiUrl, content, cotonomaId);
              });
            },
            Promise.resolve(null)
          )
            .then(() => {
              this.posting = false;
              this.posted = true;
            })
            .catch(error => {
              this.error = error;
            });
        },
        error => {
          this.error = error;
        }
      );
    }
  },

  beforeMount() {
    this.scrape();
  }
};
</script>
