var AWS = require("aws-sdk");

AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.StoreSecureStorage = (function() {

    var noop = function () {};

    var CognitoSyncStoreSecureStorage = function () {
        this.store = new cordova.plugins.SecureStorage(noop, noop, "dataset");
    };

    CognitoSyncStoreSecureStorage.prototype.makeKey = function (identityId, datasetName) {
        return identityId + "." + datasetName;
    };

    CognitoSyncStoreSecureStorage.prototype.get = function (identityId, datasetName, key, callback) {

        var k = this.makeKey(identityId, datasetName);

        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }

        var onSuccess = function(records) {
            if (records) {
                records = JSON.parse(records);
            }
            if (records && records[key]) {
                return callback(null, records[key]);
            }

            return callback(null, undefined);
        };

        var onError = function(err) {
            return callback(null, undefined);
        };

        this.store.get(onSuccess, onError, k);

    };

    CognitoSyncStoreSecureStorage.prototype.getAll = function (identityId, datasetName, callback) {

        var k = this.makeKey(identityId, datasetName);

        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }

        var onSuccess = function(records) {
            if (records) {
                records = JSON.parse(records);
            }
            return callback(null, records);
        };

        var onError = function(err) {
            return callback(null, {});
        };

        this.store.get(onSuccess, onError, k);

    };

    CognitoSyncStoreSecureStorage.prototype.set = function (identityId, datasetName, key, value, callback) {

        var k = this.makeKey(identityId, datasetName);
        var context = this;

        var onSuccess = function(records) {
            if (records) {
                records = JSON.parse(records);
            } else {
                records = {};
            }

            records[key] = value;

            context.store.set(function(key) {
                return callback(null, records);
            }, callback, k, JSON.stringify(records));
        };

        var onError = function(err) {
            var records = {};

            records[key] = value;

            context.store.set(function(key) {
                return callback(null, records);
            }, callback, k, JSON.stringify(records));
        };

        this.store.get(onSuccess, onError, k);

        return this;

    };

    CognitoSyncStoreSecureStorage.prototype.setAll = function (identityId, datasetName, obj, callback) {

        var k = this.makeKey(identityId, datasetName);

        var onSuccess = function(key) {
            return callback(null, obj);
        };

        var onError = function(err) {
            console.log(err);
            return callback(new Error(err), null);
        };

        this.store.set(onSuccess, onError, k, JSON.stringify(obj));

    };

    CognitoSyncStoreSecureStorage.prototype.remove = function (identityId, datasetName, key, callback) {

        var k = this.makeKey(identityId, datasetName);
        var context = this;

        var onSuccess = function(records) {
            if (records) {
                records = JSON.parse(records);
            } else {
                records = {};
            }

            delete(records[key]);

            context.store.set(function(key) {
                return callback(null, records);
            }, callback, k, JSON.stringify(records));
        };

        var onError = function(err) {
            var records = {};
            context.store.set(function(key) {
                return callback(null, records);
            }, callback, k, JSON.stringify(records));
        };

        this.store.get(onSuccess, onError, k);
    };

    CognitoSyncStoreSecureStorage.prototype.removeAll = function (identityId, datasetName, callback) {

        var k = this.makeKey(identityId, datasetName);

        var onSuccess = function(key) {
            return callback(null, true);
        };

        var onError = function(err) {
            console.log(err);
            return callback(new Error(err), null);
        };

        this.store.remove(onSuccess, onError, k);

    };

    CognitoSyncStoreSecureStorage.prototype.wipe = function (callback) {

        return callback(null, false);

    };

    return CognitoSyncStoreSecureStorage;

})();
