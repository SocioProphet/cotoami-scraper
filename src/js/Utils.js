import "whatwg-fetch";
import _ from "lodash";

const _throwStatusError = response => {
  var error = new Error(response.statusText);
  error.response = response;
  throw error;
}

export default class {
  static isAbsoluteUrl(url) {
    return /^[a-z][a-z\d+.-]*:/.test(url);
  }

  static isValidUrl(url) {
    return _.startsWith(url, 'http://') || _.startsWith(url, 'https://');
  }

  static checkStatusAndParseBodyAsJson(response) {
    if (response.status >= 200 && response.status < 300) {
      return response.json();
    } else {
      _throwStatusError(response);
    }
  }

  static checkStatusAndGetTextBody(response) {
    if (response.status >= 200 && response.status < 300) {
      return response.text();
    } else {
      _throwStatusError(response);
    }
  }

  static getOrCreateCotonoma(cotoamiUrl, name, cotonomaIdCallback, errorCallback) {
    if (name && name.trim() !== "") {
      const url = cotoamiUrl + "/api/cotonomas/name/" + encodeURIComponent(name.trim());
      return fetch(url, {
        credentials: "include",
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Cotoami-Client-Id": "dummy"
        }
      })
        .then(this.checkStatusAndParseBodyAsJson.bind(this))
        .then(json => {
          cotonomaIdCallback(json.id);
        })
        .catch(error => {
          errorCallback(error);
        });
    } else {
      cotonomaIdCallback(null);
    }
  }

  static fetchCotonomaSuggestions(cotoamiUrl, query) {
    if (query && query.trim() !== "") {
      const url = cotoamiUrl + "/api/cotonomas/suggestions/" + encodeURIComponent(query);
      return fetch(url, {
        credentials: "include"
      })
        .then(this.checkStatusAndParseBodyAsJson.bind(this))
        .then(json => _.map(json, "name"))
        .catch(error => {
          console.log("request failed", error);
          return [];
        });
    } else {
      return [];
    }
  }

  static postCoto(cotoamiUrl, content, cotonomaId) {
    return fetch(cotoamiUrl + "/api/cotos", {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Cotoami-Client-Id": "dummy"
      },
      body: JSON.stringify({
        coto: {
          content: content,
          summary: null,
          cotonoma_id: cotonomaId
        }
      })
    })
      .then(this.checkStatusAndParseBodyAsJson.bind(this))
  }
}