/*
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

/**
 * @fileoverview
 * Shared JavaScript client for the Santa Tracker API.
 */

goog.provide('SantaService');

/**
 * Creates a new Santa service object.
 *
 * @param {string} clientId
 * @param {string} lang
 * @param {string} version
 * @constructor
 * @export
 */
SantaService = function SantaService(clientId, lang, version) {
  /** @const @private {string} */
  this.lang_ = lang;

  /** @const @private {string} */
  this.version_ = version;

  /**
   * The user's (optional) location on the Earth, from geo-ip.
   * @private {?LatLng}
   */
  this.userLocation_ = null;

  /**
   * A number between 0 and 1, consistent within a user session. Sent to the
   * server to determine a consistent time offset for this client.
   * @const @private {number}
   */
  this.jitterRand_ = Math.random();

  /**
   * @const @private {string}
   */
  this.clientId_ = clientId;

  /**
   * @private {number}
   */
  this.offset_ = 0;

  /**
   * @private {boolean}
   */
  this.offline_ = false;

  /**
   * @private {boolean}
   */
  this.killed_ = false;

  /**
   * Active sync promise.
   * @private {Promise<!Object<string, *>>}
   */
  this.activeSync_ = null;

  /**
   * Active or previous sync promise.
   * @private {Promise<!Object<string, *>>}
   */
  this.previousSync_ = null;

  /**
   * The pending Route.
   */
  this.route_ = null;

  /**
   * Santa's next stop. Used to determine whether to trigger the "next stop" card.
   * @private {SantaLocation}
   */
  this.nextStop_ = null;

  /**
   * The next sync timeout.
   * @private {number}
   */
  this.syncTimeout_ = 0;

  /**
   * An extra offset determined by a URL parameter ("timestamp_override")
   *
   * @private {number|undefined}
   */
  this.debugOffset_;

  if (window['DEV']) {
    let overrideParam = getUrlParameter('timestamp_override');
    if (overrideParam) {
      if (overrideParam[overrideParam.length - 1] == '/') {
        overrideParam = overrideParam.slice(0, -1);
      }
      this.debugOffset_ = overrideParam - new Date();
    }
  }

  // perform initial sync and further syncs on 'online' event
  window.addEventListener('online', () => {
    this.sync();
  });
  Promise.resolve(true).then(() => this.sync());
};

/**
 * @param {string} eventName
 * @param {function()} handler
 * @export
 */
SantaService.prototype.addListener = function(eventName, handler) {
  return Events.addListener(this, eventName, handler);
};

/**
 * @param {string} eventName
 * @param {function()} handler
 * @return {boolean} whether removed successfully
 * @export
 */
SantaService.prototype.removeListener = function(eventName, handler) {
  return Events.removeListener(this, eventName, handler);
};

/**
 * List of destinations, sorted chronologically (latest destinations last).
 *
 * @return {!Array<!SantaLocation>} a list of destinations, or null if the
 * service isn't ready.
 * @export
 */
SantaService.prototype.getDestinations = function() {
  // TODO(samthor): Slice by most recent destinations.
  return [];
};

/**
 * @return {?LatLng} the user's location
 * @export
 */
SantaService.prototype.getUserLocation = function() {
  return this.userLocation_;
};

/**
 * @return {boolean} whether we're likely inside the EU
 * @export
 */
SantaService.prototype.getUserInEurope = function() {
  const loc = this.getUserLocation();
  if (!loc) {
    return true;  // can't be too sure
  }
  return !(loc.lng > 39.869 || loc.lng < -31.266 || loc.lat > 81.008 || loc.lat < 27.636);
};

/**
 * Returns the expected arrival time of Santa for this specific user. This is not transformed by
 * any offset.
 * @return {number} the expected arrival time of Santa, or zero if unknown
 * @export
 */
SantaService.prototype.getArrivalTime = function() {
  return 0;
};

/**
 * @return {!Array<!StreamCard>}
 * @export
 */
SantaService.prototype.getStream = function() {
  return [];
};

/**
 * Synchronize info with the server, but not if a sync was recently completed.
 *
 * @return {!Promise<!Object<string, *>>}
 */
SantaService.prototype.recent = function() {
  if (this.recentSync_) {
    return this.recentSync_;
  }
  return this.sync();
};

/**
 * Synchronize info with the server. This function returns immediately, the
 * synchronization is performed asynchronously.
 *
 * @export
 * @return {!Promise<!Object<string, *>>}
 */
SantaService.prototype.sync = function() {
  if (this.activeSync_) {
    return this.activeSync_;
  }

  const data = {
    'rand': this.jitterRand_,
    'client': this.clientId_,
    'language': this.lang_,
  };
  const p = santaAPIRequest('info', data);
  this.activeSync_ = p;
  this.recentSync_ = p;

  p.then((result) => {
    const ok = (result['status'] === 'OK' && !result['switchOff']);
    if (ok) {
      this.setOffline_(false);
    } else {
      console.error('api', result['status'], result['switchOff']);
      this.kill_();
    }

    this.offset_ = result['now'] + result['timeOffset'] - new Date();

    if (result['upgradeToVersion'] && this.version_) {
      if (this.version_ < result['upgradeToVersion']) {
        console.warn('reload: this', this.version_, 'upgrade to', result['upgradeToVersion']);
        Events.trigger(this, 'reload');
      }
    }

    this.userLocation_ = parseLatLng(/** @type {string} */ (result['location']));
    this.scheduleSync_(/** @type {number} */ (result['refresh']), false);

    // trigger event in microtask
    Promise.resolve(true).then(() => Events.trigger(this, 'sync'));
  });

  p.catch(() => {
    this.scheduleSync_(0, true);
    this.setOffline_(true);
  }).then(() => {
    // always clear activeSync_
    this.activeSync_ = null;
  });

  return this.activeSync_;
};

/**
 * @export
 */
class Route {
  /**
   * @param {!Object<string, *>} data
   */
  constructor(url, data) {
    /** @type {string} */
    this.url = url;

    // TODO
    this.stream_ = data['stream'];

    const destinations = /** @type {!Array<!Object>} */ (data['destinations']) || [];
    const arr = [];
    const update = destinations.map((raw, i) => new SantaLocation(raw, arr, i));
    arr.push(...update);

    /**
     * @export @const @type {!Array<!SantaLocation>}
     */
    this.locations = arr;
    if (!this.locations.length) {
      console.warn('got bad data', data);
      throw new Error('no destinations for Santa');
    }

    /**
     * @type {number}
     */
    this.previousFoundDestination_ = 0;
  }

  /**
   * @return {!Array<!SantaLocation>}
   * @export
   */
  getLocations() {
    return this.locations.slice();
  }

  /**
   * @param {number} timestamp to fetch locations to
   * @param {number=} limit or zero to return all
   * @return {!Array<!SantaLocation>}
   * @export
   */
  getLocationsTo(timestamp, limit) {
    const index = this.findDestinationIndex_(timestamp);
    const low = (limit > 0 ? Math.max(0, index - limit + 1) : 0);
    return this.locations.slice(low, index + 1);
  }

  /**
   * Finds Santa's current SantaLocation, or the one he was most recently at.
   *
   * @param {number} timestamp
   * @return {!SantaLocation}
   * @export
   */
  findDestination(timestamp) {
    return this.locations[this.findDestinationIndex_(timestamp)];
  }

  /**
   * Return the SantaState object for the current time.
   *
   * @param {number} timestamp
   * @param {?LatLng=} userLocation
   * @return {SantaState}
   * @export
   */
  getState(timestamp, userLocation = null) {
    const dest = this.findDestination(timestamp);
    const next = dest.next();

    if (timestamp < dest.departure) {
      // Santa is at this location.
      return /** @type {SantaState} */ ({
        position: dest.getLocation(),
        presentsDelivered: calculatePresentsDelivered(timestamp, dest.prev(), dest, next),
        distanceTravelled: dest.getDistanceTravelled(),
        heading: 0,
        prev: dest.prev(),
        stopover: dest,
        next: next,
      });
    }

    // Santa is in transit.
    const travelTime = next.arrival - dest.departure;
    const elapsed = Math.max(timestamp - dest.departure, 0);

    let currentLocation;

/*    if (dest.id === this.userStopAfter_ && userLocation != null) {
      const ratio = elapsed / travelTime;
      // If this is the segment where the user is, interpolate to them.
      var firstDistance = Spherical.computeDistanceBetween(dest.getLocation(), userLocation);
      var secondDistance = Spherical.computeDistanceBetween(userLocation, next.getLocation());
      var along = (firstDistance + secondDistance) * ratio;
      if (along < firstDistance) {
        var firstRatio = firstDistance ? (along / firstDistance) : 0;
        currentLocation = Spherical.interpolate(dest.getLocation(), userLocation, firstRatio);
      } else {
        var secondRatio = secondDistance ? ((along - firstDistance) / secondDistance) : 0;
        currentLocation = Spherical.interpolate(userLocation, next.getLocation(), secondRatio);
      }
    } else */ {
      // Otherwise, interpolate between stops normally.
      currentLocation = Spherical.interpolate(
          dest.getLocation(),
          next.getLocation(),
          elapsed / travelTime);
    }

    return /** @type {SantaState} */ ({
      position: currentLocation,
      heading: Spherical.computeHeading(currentLocation, next.getLocation()),
      presentsDelivered: calculatePresentsDelivered(timestamp, dest, null, next),
      distanceTravelled: calculateDistanceTravelled(timestamp, dest, next),
      prev: dest,
      stopover: null,
      next: next,
    });
  }

  findDestinationIndex_(timestamp) {
    const first = this.locations[0];
    if (first.departure > timestamp) {
      return 0;  // not flying yet, assume at workshop
    }

    let i;
    for (i = 0; i < this.locations.length; ++i) {
      const dest = this.locations[i];
      if (timestamp < dest.arrival) {
        break;
      }
    }
    return Math.max(0, i - 1);
  }
}

/**
 * Fetches the route.
 *
 * @return {!Promise<!Route>}
 * @export
 */
SantaService.prototype.route = function() {
  if (this.route_) {
    // TODO: we need to be able to invalidate thsi
    return this.route_;
  }

  const p = this.recent().then((data) => {
    const url = /** @type {string} */ (data['route']);

    const previousUrl = window.localStorage['routeUrl'];
    if (previousUrl === url) {
      const routeData = window.localStorage['route'];
      if (routeData) {
        let json;
        try {
          json = /** @type {!Object<string, *>} */ (JSON.parse(routeData));
        } catch (e) {
          // ignore
        }
        if (json && typeof json === 'object') {
          return new Route(url, json);
        }
        console.debug('couldn\'t parse cached route JSON');
      }
    }

    return fetchJSON(url).then((routeData) => {
      if (this.route_ !== p) {
        return this.route_;  // we got changed, return the replacement
      }

      // hard-coded removal of most of the JSON
      routeData = {
        'destinations': routeData['destinations'],
        'stream': routeData['stream'],
      };

      // This will store about ~600-700kb of route data: the best resources online indicate that
      // this is totally safe to do. At worst, eviction will just force another network request.
      window.localStorage['routeUrl'] = url;
      window.localStorage['route'] = JSON.stringify(routeData);
      return new Route(url, routeData);
    });
  });

  this.route_ = p;
  return p;
};

/**
 * Schedules another sync, clearing any previous pending sync.
 *
 * @param {number} after how long to wait before sync (zero or -ve uses default)
 * @param {boolean} foreground whether to wait for Santa to be in the foreground (rAF)
 */
SantaService.prototype.scheduleSync_ = function(after, foreground) {
  if (!after || !isFinite(after) || after <= 0) {
    after = (1000 * 60 * (Math.random() + 0.5));
  }

  const localTimeout = window.setTimeout(() => {
    if (foreground) {
      // only sync when we go back into the foreground
      return window.requestAnimationFrame(() => {
        if (localTimeout === this.syncTimeout_) {
          this.sync();
        }
      });
    }
    this.sync();
  }, after);

  window.clearTimeout(this.syncTimeout_);
  this.syncTimeout_ = localTimeout; 
};

/**
 * Send the kill event, if not already killed. Once killed, a client must restart.
 *
 * @private
 */
SantaService.prototype.kill_ = function() {
  if (!this.killed_) {
    this.killed_ = true;
    Events.trigger(this, 'kill');
  }
};

/**
 * Set offline status, including firing relevant events
 *
 * @param {boolean} offline whether we are probably offline
 * @private
 */
SantaService.prototype.setOffline_ = function(offline) {
  if (this.offline_ === offline) {
    // do nothing
  } else if (offline) {
    this.offline_ = true;
    Events.trigger(this, 'offline');
  } else {
    this.offline_ = false;
    Events.trigger(this, 'online');
  }
}

/**
 * @return {number}
 * @export
 */
SantaService.prototype.now = function() {
  return +new Date() + (this.debugOffset_ || this.offset_ || 0);
};

/**
 * @return {!Date}
 * @export
 */
SantaService.prototype.dateNow = function() {
  return new Date(this.now());
};

/**
 * @return {boolean} true if the service is offline.
 * @export
 */
SantaService.prototype.isOffline = function() {
  return this.offline_;
};
