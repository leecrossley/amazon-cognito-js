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

        this.store.get(function(records) {
            if (records) {
                records = JSON.parse(records);
            }
            if (records && records[key]) {
                return callback(null, records[key]);
            }

            return callback(null, undefined);
        }, callback, k);

    };

    CognitoSyncStoreSecureStorage.prototype.getAll = function (identityId, datasetName, callback) {

        var k = this.makeKey(identityId, datasetName);

        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }

        this.store.get(function(records) {
            if (records) {
                records = JSON.parse(records);
            }
            return callback(null, records);
        }, callback, k);

    };

    CognitoSyncStoreSecureStorage.prototype.set = function (identityId, datasetName, key, value, callback) {

        var k = this.makeKey(identityId, datasetName);

        var records = JSON.parse(this.store.getItem(k));
        if (!records) {
            records = {};
        }

        records[key] = value;

        this.store.set(function(key) {
            return callback(null, records);
        }, callback, k, JSON.stringify(records));

        return this;

    };

    CognitoSyncStoreSecureStorage.prototype.setAll = function (identityId, datasetName, obj, callback) {

        var k = this.makeKey(identityId, datasetName);

        this.store.set(function(key) {
            return callback(null, obj);
        }, callback, k, JSON.stringify(obj));

    };

    CognitoSyncStoreSecureStorage.prototype.remove = function (identityId, datasetName, key, callback) {

        var k = this.makeKey(identityId, datasetName);

        this.store.get(function(records) {
            if (records) {
                records = JSON.parse(records);
            } else {
                records = {};
            }

            delete(records[key]);

            this.store.set(function(key) {
                return callback(null, records);
            }, callback, k, JSON.stringify(records));

        }, callback, k);
    };

    CognitoSyncStoreSecureStorage.prototype.removeAll = function (identityId, datasetName, callback) {

        var k = this.makeKey(identityId, datasetName);

        this.store.remove(function(key) {
            return callback(null, true);
        }, callback, k);

    };

    CognitoSyncStoreSecureStorage.prototype.wipe = function (callback) {

        return callback(null, false);

    };

    return CognitoSyncStoreSecureStorage;

})();
