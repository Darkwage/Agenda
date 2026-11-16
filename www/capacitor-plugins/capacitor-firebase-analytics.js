/* Shim : la version web du SDK Firebase n'est pas utilisée (appli Android native). */
var firebaseAnalyticsExports = window.firebaseAnalyticsExports || {};
var capacitorFirebaseAnalytics = (function (exports, core, analytics) {
    'use strict';

    /**
     * @since 6.0.0
     */
    exports.ConsentType = void 0;
    (function (ConsentType) {
        /**
         * @since 6.0.0
         */
        ConsentType["AdPersonalization"] = "AD_PERSONALIZATION";
        /**
         * @since 6.0.0
         */
        ConsentType["AdStorage"] = "AD_STORAGE";
        /**
         * @since 6.0.0
         */
        ConsentType["AdUserData"] = "AD_USER_DATA";
        /**
         * @since 6.0.0
         */
        ConsentType["AnalyticsStorage"] = "ANALYTICS_STORAGE";
        /**
         * @since 6.0.0
         */
        ConsentType["FunctionalityStorage"] = "FUNCTIONALITY_STORAGE";
        /**
         * @since 6.0.0
         */
        ConsentType["PersonalizationStorage"] = "PERSONALIZATION_STORAGE";
    })(exports.ConsentType || (exports.ConsentType = {}));
    /**
     * @since 6.0.0
     */
    exports.ConsentStatus = void 0;
    (function (ConsentStatus) {
        /**
         * @since 6.0.0
         */
        ConsentStatus["Granted"] = "GRANTED";
        /**
         * @since 6.0.0
         */
        ConsentStatus["Denied"] = "DENIED";
    })(exports.ConsentStatus || (exports.ConsentStatus = {}));

    const FirebaseAnalytics = core.registerPlugin('FirebaseAnalytics', {
        web: () => Promise.resolve().then(function () { return web; }).then(m => new m.FirebaseAnalyticsWeb()),
    });

    class FirebaseAnalyticsWeb extends core.WebPlugin {
        async getAppInstanceId() {
            throw this.unimplemented('Not implemented on web.');
        }
        async setConsent(options) {
            const status = options.status === exports.ConsentStatus.Granted ? 'granted' : 'denied';
            const consentSettings = {};
            switch (options.type) {
                case exports.ConsentType.AdPersonalization:
                    consentSettings.ad_personalization = status;
                    break;
                case exports.ConsentType.AdStorage:
                    consentSettings.ad_storage = status;
                    break;
                case exports.ConsentType.AdUserData:
                    consentSettings.ad_user_data = status;
                    break;
                case exports.ConsentType.AnalyticsStorage:
                    consentSettings.analytics_storage = status;
                    break;
                case exports.ConsentType.FunctionalityStorage:
                    consentSettings.functionality_storage = status;
                    break;
                case exports.ConsentType.PersonalizationStorage:
                    consentSettings.personalization_storage = status;
                    break;
            }
            analytics.setConsent(consentSettings);
        }
        async setUserId(options) {
            const analytics$1 = analytics.getAnalytics();
            analytics.setUserId(analytics$1, options.userId);
        }
        async setUserProperty(options) {
            const analytics$1 = analytics.getAnalytics();
            analytics.setUserProperties(analytics$1, {
                [options.key]: options.value,
            });
        }
        async setCurrentScreen(options) {
            const analytics$1 = analytics.getAnalytics();
            analytics.logEvent(analytics$1, 'screen_view', {
                firebase_screen: options.screenName || undefined,
                firebase_screen_class: options.screenClassOverride || undefined,
            });
        }
        async logEvent(options) {
            const analytics$1 = analytics.getAnalytics();
            analytics.logEvent(analytics$1, options.name, options.params);
        }
        async logTransaction(_options) {
            throw this.unimplemented('Not implemented on web.');
        }
        async setSessionTimeoutDuration(_options) {
            throw this.unimplemented('Not implemented on web.');
        }
        async setEnabled(_options) {
            const analytics$1 = analytics.getAnalytics();
            analytics.setAnalyticsCollectionEnabled(analytics$1, _options.enabled);
        }
        async isEnabled() {
            const enabled = window['ga-disable-analyticsId'] === true;
            return {
                enabled,
            };
        }
        async resetAnalyticsData() {
            throw this.unimplemented('Not implemented on web.');
        }
        async initiateOnDeviceConversionMeasurementWithEmailAddress(_options) {
            throw this.unimplemented('Not implemented on web.');
        }
        async initiateOnDeviceConversionMeasurementWithPhoneNumber(_options) {
            throw this.unimplemented('Not implemented on web.');
        }
        async initiateOnDeviceConversionMeasurementWithHashedEmailAddress(_options) {
            throw this.unimplemented('Not implemented on web.');
        }
        async initiateOnDeviceConversionMeasurementWithHashedPhoneNumber(_options) {
            throw this.unimplemented('Not implemented on web.');
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        FirebaseAnalyticsWeb: FirebaseAnalyticsWeb
    });

    exports.FirebaseAnalytics = FirebaseAnalytics;

    return exports;

})({}, capacitorExports, firebaseAnalyticsExports);
