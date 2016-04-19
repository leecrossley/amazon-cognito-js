/**
 * Copyright 2014 Amazon.com,
 * Inc. or its affiliates. All Rights Reserved.
 * 
 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the
 * License. A copy of the License is located at
 * 
 *     http://aws.amazon.com/asl/
 * 
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, express or implied. See the License
 * for the specific language governing permissions and
 * limitations under the License. 
 */



if (AWS === undefined) {
    throw new Error("AWS SDK must be loaded before loading the Sync Manager.");
} else {
    AWS.CognitoSyncManager = function(options) {
        options = options || {};
        var USER_AGENT = "CognitoJavaScriptSDK/1";
        this.provider = AWS.config.credentials;
        this.identityPoolId = this.provider.params.IdentityPoolId;
        this.region = AWS.config.region;
        if (!this.provider.identityId && this.provider.params.IdentityId) {
            this.provider.identityId = this.provider.params.IdentityId;
        }
        this.logger = options.log;
        if (typeof this.logger !== "function") {
            this.logger = function() {};
        }
        var storageOps = {};
        if (cordova && cordova.plugins && cordova.plugins.SecureStorage) {
            storageOps.DataStore = AWS.CognitoSyncManager.StoreSecureStorage;
        } else {
            storageOps.DataStore = AWS.CognitoSyncManager.StoreLocalStorage;
        }
        this.local = new AWS.CognitoSyncManager.LocalStorage(storageOps);
        this.remote = new AWS.CognitoSyncManager.RemoteStorage(this.identityPoolId, this.provider);
        this.remote.setUserAgent(USER_AGENT);
    };
    AWS.CognitoSyncManager.prototype.openOrCreateDataset = function(datasetName, callback) {
        var root = this;
        var namePattern = new RegExp("^[a-zA-Z0-9_.:-]{1,128}$");
        if (namePattern.test(datasetName)) {
            this.local.createDataset(this.getIdentityId(), datasetName, function(err, data) {
                if (err) {
                    return callback(err, null);
                }
                callback(null, new AWS.CognitoSyncManager.Dataset(data, root.provider, root.local, root.remote, root.logger));
            });
        } else {
            callback(new Error("Dataset name must match the pattern " + namePattern.toString()));
        }
    };
    AWS.CognitoSyncManager.prototype.listDatasets = function(callback) {
        this.local.getDatasets(this.getIdentityId(), callback);
    };
    AWS.CognitoSyncManager.prototype.refreshDatasetMetadata = function(callback) {
        var root = this;
        this.remote.getDatasets(function(err, datasets) {
            var metadata = [];
            var request = function(ds) {
                root.local.updateDatasetMetadata(root.getIdentityId(), ds, response);
            };
            var response = function(err, md) {
                metadata.push(md);
                if (datasets.length > 0) {
                    request(datasets.shift());
                } else {
                    callback(null, metadata);
                }
            };
            if (datasets.length > 0) {
                request(datasets.shift(), callback);
            } else {
                callback(null, []);
            }
        });
    };
    AWS.CognitoSyncManager.prototype.wipeData = function() {
        this.provider.clearCachedId();
        this.local.wipeData();
    };
    AWS.CognitoSyncManager.prototype.getIdentityId = function() {
        return this.provider.identityId;
    };
}



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.Conflict = function() {
    var CognitoSyncConflict = function(remoteRecord, localRecord) {
        if (!remoteRecord || !localRecord) {
            throw new Error("Remote and local records cannot be null.");
        }
        if (!remoteRecord.getKey || !localRecord.getKey) {
            throw new Error("Records are not record objects.");
        }
        if (remoteRecord.getKey() !== localRecord.getKey()) {
            throw new Error("Remote and local keys do not match.");
        }
        this.key = remoteRecord.getKey();
        this.remoteRecord = remoteRecord;
        this.localRecord = localRecord;
    };
    CognitoSyncConflict.prototype.getKey = function() {
        return this.key;
    };
    CognitoSyncConflict.prototype.getRemoteRecord = function() {
        return this.remoteRecord;
    };
    CognitoSyncConflict.prototype.getLocalRecord = function() {
        return this.localRecord;
    };
    CognitoSyncConflict.prototype.resolveWithRemoteRecord = function() {
        this.remoteRecord.setModified(false);
        return this.remoteRecord;
    };
    CognitoSyncConflict.prototype.resolveWithLocalRecord = function() {
        this.localRecord.setSyncCount(this.remoteRecord.getSyncCount());
        this.localRecord.setModified(true);
        return this.localRecord;
    };
    CognitoSyncConflict.prototype.resolveWithValue = function(newValue) {
        return new AWS.CognitoSyncManager.Record({
            Key: this.remoteRecord.getKey(),
            Value: newValue,
            SyncCount: this.remoteRecord.getSyncCount(),
            LastModifiedDate: new Date(),
            LastModifiedBy: this.localRecord.getLastModifiedBy(),
            DeviceLastModifiedDate: new Date(),
            Modified: true
        });
    };
    return CognitoSyncConflict;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.Dataset = function() {
    var CognitoSyncDataset = function(datasetName, provider, local, remote, logger) {
        this.MAX_RETRY = 3;
        this.datasetName = datasetName;
        this.provider = provider;
        this.local = local;
        this.remote = remote;
        this.logger = logger || function() {};
    };
    CognitoSyncDataset.prototype.validateKey = function(key) {
        var namePattern = new RegExp("^[a-zA-Z0-9_.:-]{1,128}$");
        return namePattern.test(key);
    };
    CognitoSyncDataset.prototype.put = function(key, value, callback) {
        var valueType = typeof value;
        if (!this.validateKey(key)) {
            return callback(new Error("Invalid key."));
        }
        if (valueType !== "string") {
            return callback(new Error("The value type must be a string but was " + valueType + "."));
        }
        this.local.putValue(this.getIdentityId(), this.datasetName, key, value, callback);
    };
    CognitoSyncDataset.prototype.remove = function(key, callback) {
        if (!this.validateKey(key)) {
            return callback(new Error("Invalid key."));
        }
        this.local.putValue(this.getIdentityId(), this.datasetName, key, null, callback);
    };
    CognitoSyncDataset.prototype.get = function(key, callback) {
        if (!this.validateKey(key)) {
            return callback(new Error("Invalid key."));
        }
        this.local.getValue(this.getIdentityId(), this.datasetName, key, callback);
    };
    CognitoSyncDataset.prototype.getAllRecords = function(callback) {
        this.local.getRecords(this.getIdentityId(), this.datasetName, callback);
    };
    CognitoSyncDataset.prototype.getDataStorage = function(callback) {
        this.getDatasetMetadata(function(err, meta) {
            if (err) {
                return callback(err);
            }
            if (!meta) {
                return callback(null, 0);
            }
            return callback(null, meta.getDataStorage());
        });
    };
    CognitoSyncDataset.prototype.isChanged = function(key, callback) {
        if (!this.validateKey(key)) {
            return callback(new Error("Invalid key."));
        }
        this.local.getRecord(this.getIdentityId(), this.datasetName, key, function(err, record) {
            callback(null, record && record.isModified());
        });
    };
    CognitoSyncDataset.prototype.getDatasetMetadata = function(callback) {
        this.local.getDatasetMetadata(this.getIdentityId(), this.datasetName, callback);
    };
    CognitoSyncDataset.prototype.resolve = function(resolvedRecords, callback) {
        this.local.putRecords(this.getIdentityId(), this.datasetName, resolvedRecords, callback);
    };
    CognitoSyncDataset.prototype.putAll = function(values, callback) {
        var isValid = true;
        for (var key in values) {
            if (values.hasOwnProperty(key)) {
                if (!this.validateKey(key)) {
                    isValid = false;
                }
            }
        }
        if (!isValid) {
            return callback(new Error("Object contains invalid keys."));
        }
        this.local.putAllValues(this.getIdentityId(), this.datasetName, values, callback);
    };
    CognitoSyncDataset.prototype.getAll = function(callback) {
        var map = {};
        var record;
        this.local.getRecords(this.getIdentityId(), this.datasetName, function(err, records) {
            if (err) {
                return callback(err);
            }
            for (var r in records) {
                if (records.hasOwnProperty(r)) {
                    record = records[r];
                    if (!record.isDeleted()) {
                        map[record.getKey()] = record.getValue();
                    }
                }
            }
            callback(null, map);
        });
    };
    CognitoSyncDataset.prototype.getIdentityId = function() {
        return this.provider.identityId;
    };
    CognitoSyncDataset.prototype.getModifiedRecords = function(callback) {
        this.local.getModifiedRecords(this.getIdentityId(), this.datasetName, callback);
    };
    CognitoSyncDataset.prototype.getLocalMergedDatasets = function(callback) {
        var mergedDatasets = [];
        var prefix = this.datasetName + ".";
        var dataset;
        this.local.getDatasets(this.getIdentityId(), function(err, datasets) {
            for (var d in datasets) {
                if (datasets.hasOwnProperty(d)) {
                    dataset = datasets[d];
                    if (dataset.getDatasetName().indexOf(prefix) === 0) {
                        mergedDatasets.push(dataset.getDatasetName());
                    }
                }
            }
            callback(null, mergedDatasets);
        });
    };
    CognitoSyncDataset.prototype.synchronize = function(callback, retry) {
        var root = this;
        callback = callback || {};
        callback.onSuccess = callback.onSuccess || function(dataset, updates) {};
        callback.onFailure = callback.onFailure || function(err) {};
        callback.onConflict = callback.onConflict || function(dataset, conflicts, callback) {
            return callback(false);
        };
        callback.onDatasetDeleted = callback.onDatasetDeleted || function(dataset, deletedDataset, callback) {
            return callback(false);
        };
        callback.onDatasetsMerged = callback.onDatasetsMerged || function(dataset, merges, callback) {
            return callback(false);
        };
        if (retry === undefined) {
            retry = this.MAX_RETRY;
        }
        root.logger("Starting synchronization... (retires: " + retry + ")");
        if (retry < 0) {
            return callback.onFailure(new Error("Synchronize failed: exceeded maximum retry count."));
        }
        this.getLocalMergedDatasets(function(err, mergedDatasets) {
            if (err) {
                callback.onFailure(err);
            }
            root.logger("Checking for locally merged datasets... found " + mergedDatasets.length + ".");
            if (mergedDatasets.length > 0) {
                root.logging("Deferring to .onDatasetsMerged.");
                return callback.onDatasetsMerged(root, mergedDatasets, function(isContinue) {
                    if (!isContinue) {
                        return callback.onFailure(new Error("Synchronization cancelled by onDatasetsMerged() callback returning false."));
                    } else {
                        return root.synchronize(callback, --retry);
                    }
                });
            } else {
                root.local.getLastSyncCount(root.getIdentityId(), root.datasetName, function(err, syncCount) {
                    if (err) {
                        return callback.onFailure(err);
                    }
                    root.logger("Detecting last sync count... " + syncCount);
                    if (syncCount == -1) {
                        root.remote.deleteDataset(root.datasetName, function(err, data) {
                            if (err) {
                                return callback.onFailure(err);
                            }
                            root.local.purgeDataset(root.getIdentityId(), root.datasetName, function(err) {
                                if (err) {
                                    return callback.onFailure(err);
                                }
                                return callback.onSuccess(root);
                            });
                        });
                    } else {
                        root.remote.listUpdates(root.datasetName, syncCount, function(err, remoteRecords) {
                            if (err) {
                                return callback.onFailure(err);
                            }
                            root.logger("Fetch remote updates... found " + remoteRecords.records.length + ".");
                            var mergedNameList = remoteRecords.getMergedDatasetNameList();
                            root.logger("Checking for remote merged datasets... found " + mergedNameList.length + ".");
                            if (mergedNameList.length > 0) {
                                root.logger("Deferring to .onDatasetsMerged.");
                                return callback.onDatasetsMerged(root, mergedNameList, function(doContinue) {
                                    if (!doContinue) {
                                        callback.onFailure(new Error("Cancelled due to .onDatasetsMerged result."));
                                    } else {
                                        root._synchronizeInternal(callback, --retry);
                                    }
                                });
                            }
                            if (syncCount !== 0 && !remoteRecords || remoteRecords.isDeleted()) {
                                return callback.onDatasetDeleted(root, remoteRecords.getDatasetName(), function(doContinue) {
                                    root.logging("Dataset should be deleted. Deferring to .onDatasetDeleted.");
                                    if (doContinue) {
                                        root.logging(".onDatasetDeleted returned true, purging dataset locally.");
                                        return root.local.purgeDataset(root.getIdentityId(), root.datasetName, function(err) {
                                            if (err) {
                                                return callback.onFailure(err);
                                            }
                                            return root._synchronizeInternal(callback, --retry);
                                        });
                                    } else {
                                        root.logging(".onDatasetDeleted returned false, cancelling sync.");
                                        return callback.onFailure(new Error("Cancelled due to .onDatasetDeleted result."));
                                    }
                                });
                            }
                            var updatedRemoteRecords = remoteRecords.getRecords();
                            var lastSyncCount = remoteRecords.getSyncCount();
                            var sessionToken = remoteRecords.getSyncSessionToken();
                            root.logger("Checking for remote updates since last sync count... found " + updatedRemoteRecords.length + ".");
                            if (updatedRemoteRecords.length > 0) {
                                root._synchronizeResolveLocal(updatedRemoteRecords, function(err, conflicts) {
                                    if (err) {
                                        return callback.onFailure(err);
                                    }
                                    root.logger("Checking for conflicts... found " + conflicts.length + ".");
                                    if (conflicts.length > 0) {
                                        root.logger("Conflicts detected. Deferring to .onConflict.");
                                        callback.onConflict(root, conflicts, function(isContinue) {
                                            if (!isContinue) {
                                                root.logger(".onConflict returned false. Cancelling sync.");
                                                return callback.onFailure(new Error("Sync cancelled. Conflict callback returned false."));
                                            } else {
                                                root._synchronizePushRemote(sessionToken, syncCount, function() {
                                                    return root.synchronize(callback, --retry);
                                                });
                                            }
                                        });
                                    } else {
                                        root.logger("No conflicts. Updating local records.");
                                        root.local.putRecords(root.getIdentityId(), root.datasetName, updatedRemoteRecords, function(err) {
                                            if (err) {
                                                return callback.onFailure(err);
                                            }
                                            root.local.updateLastSyncCount(root.getIdentityId(), root.datasetName, lastSyncCount, function(err) {
                                                if (err) {
                                                    return callback.onFailure(err);
                                                }
                                                root.logger("Finished resolving records. Restarting sync.");
                                                return root.synchronize(callback, --retry);
                                            });
                                        });
                                    }
                                });
                            } else {
                                root.logger("Nothing updated remotely. Pushing local changes to remote.");
                                root._synchronizePushRemote(sessionToken, lastSyncCount, function(err) {
                                    if (err) {
                                        root.logger("Remote push failed. Likely concurrent sync conflict. Retrying...");
                                        return root.synchronize(callback, --retry);
                                    }
                                    root.logger("Sync successful.");
                                    return callback.onSuccess(root, updatedRemoteRecords);
                                });
                            }
                        });
                    }
                });
            }
        });
    };
    CognitoSyncDataset.prototype._synchronizeResolveLocal = function(remoteRecords, callback) {
        var root = this;
        var conflicts = [];
        if (remoteRecords && remoteRecords.length > 0) {
            root.local.getRecords(root.getIdentityId(), root.datasetName, function(err, localRecords) {
                var localMap = {};
                var i, key, local;
                for (i = 0; i < localRecords.length; i++) {
                    localMap[localRecords[i].getKey()] = localRecords[i];
                }
                for (i = 0; i < remoteRecords.length; i++) {
                    key = remoteRecords[i].getKey();
                    local = localMap[key];
                    if (local && local.isModified() && local.getValue() !== remoteRecords[i].getValue()) {
                        conflicts.push(new AWS.CognitoSyncManager.Conflict(remoteRecords[i], local));
                    }
                }
                return callback(null, conflicts);
            });
        } else {
            return callback(null, conflicts);
        }
    };
    CognitoSyncDataset.prototype._synchronizePushRemote = function(sessionToken, syncCount, callback) {
        var root = this;
        this.getModifiedRecords(function(err, localChanges) {
            if (localChanges.length > 0) {
                root.remote.putRecords(root.datasetName, localChanges, sessionToken, function(err, records) {
                    if (err) {
                        callback(err);
                    }
                    root.local.putRecords(root.getIdentityId(), root.datasetName, records, function(err) {
                        if (err) {
                            return callback(err);
                        }
                        var newSyncCount = 0;
                        for (var r in records) {
                            if (records.hasOwnProperty(r)) {
                                newSyncCount = newSyncCount < records[r].getSyncCount() ? records[r].getSyncCount() : newSyncCount;
                            }
                        }
                        root.local.updateLastSyncCount(root.getIdentityId(), root.datasetName, newSyncCount, function(err) {
                            if (err) {
                                return callback(err);
                            }
                            return callback(null, true);
                        });
                    });
                });
            } else {
                return callback(null, true);
            }
        });
    };
    return CognitoSyncDataset;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.DatasetMetadata = function() {
    var CognitoSyncDatasetMetadata = function(metadata) {
        metadata = metadata || {};
        this.datasetName = metadata.DatasetName || "";
        this.creationDate = new Date(metadata.CreationDate) || new Date();
        this.lastModifiedDate = new Date(metadata.LastModifiedDate) || new Date();
        this.lastModifiedBy = metadata.LastModifiedBy || "";
        this.dataStorage = metadata.DataStorage || 0;
        this.recordCount = metadata.NumRecords || 0;
        this.lastSyncCount = metadata.LastSyncCount || 0;
        this.lastSyncDate = metadata.LastSyncDate ? new Date(metadata.LastSyncDate) : new Date();
        if (this.dataStorage < 0) {
            throw new RangeError("Storage size cannot be negative.");
        }
        if (this.recordCount < 0) {
            throw new RangeError("Record count cannot be negative.");
        }
    };
    CognitoSyncDatasetMetadata.prototype.getDatasetName = function() {
        return this.datasetName;
    };
    CognitoSyncDatasetMetadata.prototype.setDatasetName = function(datasetName) {
        this.datasetName = datasetName;
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getCreationDate = function() {
        return this.creationDate;
    };
    CognitoSyncDatasetMetadata.prototype.setCreationDate = function(creationDate) {
        this.creationDate = new Date(creationDate);
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getLastModifiedDate = function() {
        return this.lastModifiedDate;
    };
    CognitoSyncDatasetMetadata.prototype.setLastModifiedDate = function(modifiedDate) {
        this.lastModifiedDate = new Date(modifiedDate);
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getLastModifiedBy = function() {
        return this.lastModifiedBy;
    };
    CognitoSyncDatasetMetadata.prototype.setLastModifiedBy = function(modifiedBy) {
        this.lastModifiedBy = modifiedBy;
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getDataStorage = function() {
        return this.dataStorage;
    };
    CognitoSyncDatasetMetadata.prototype.setDataStorage = function(storageSize) {
        this.dataStorage = storageSize;
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getRecordCount = function() {
        return this.recordCount;
    };
    CognitoSyncDatasetMetadata.prototype.setRecordCount = function(recordCount) {
        this.recordCount = recordCount;
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getLastSyncCount = function() {
        return this.lastSyncCount;
    };
    CognitoSyncDatasetMetadata.prototype.setLastSyncCount = function(syncCount) {
        this.lastSyncCount = syncCount;
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.getLastSyncDate = function() {
        return this.lastSyncDate;
    };
    CognitoSyncDatasetMetadata.prototype.setLastSyncDate = function(syncDate) {
        this.lastSyncDate = syncDate;
        return this;
    };
    CognitoSyncDatasetMetadata.prototype.toString = function() {
        return JSON.stringify(this.toJSON());
    };
    CognitoSyncDatasetMetadata.prototype.toJSON = function() {
        return {
            DatasetName: this.datasetName,
            CreationDate: this.creationDate,
            LastModifiedDate: this.lastModifiedDate,
            LastModifiedBy: this.lastModifiedBy,
            DataStorage: this.dataStorage,
            NumRecords: this.recordCount,
            LastSyncCount: this.lastSyncCount,
            LastSyncDate: this.lastSyncDate
        };
    };
    return CognitoSyncDatasetMetadata;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.DatasetUpdates = function() {
    var CognitoSyncDatasetUpdates = function(datasetName) {
        this.datasetName = datasetName;
        this.records = [];
        this.syncCount = 0;
        this.syncSessionToken = "";
        this.exists = true;
        this.deleted = false;
        this.mergedDatasetNameList = [];
    };
    CognitoSyncDatasetUpdates.prototype.getDatasetName = function() {
        return this.datasetName;
    };
    CognitoSyncDatasetUpdates.prototype.setDatasetName = function(datasetName) {
        this.datasetName = datasetName;
        return this;
    };
    CognitoSyncDatasetUpdates.prototype.getRecords = function() {
        return this.records;
    };
    CognitoSyncDatasetUpdates.prototype.addRecord = function(record) {
        this.records.push(record);
        return this;
    };
    CognitoSyncDatasetUpdates.prototype.getSyncCount = function() {
        return this.syncCount;
    };
    CognitoSyncDatasetUpdates.prototype.setSyncCount = function(syncCount) {
        this.syncCount = syncCount;
        return this;
    };
    CognitoSyncDatasetUpdates.prototype.getSyncSessionToken = function() {
        return this.syncSessionToken;
    };
    CognitoSyncDatasetUpdates.prototype.setSyncSessionToken = function(syncToken) {
        this.syncSessionToken = syncToken;
        return this;
    };
    CognitoSyncDatasetUpdates.prototype.isExists = function() {
        return this.exists;
    };
    CognitoSyncDatasetUpdates.prototype.setExists = function(exists) {
        this.exists = exists;
        return this;
    };
    CognitoSyncDatasetUpdates.prototype.isDeleted = function() {
        return this.deleted;
    };
    CognitoSyncDatasetUpdates.prototype.setDeleted = function(deleted) {
        this.deleted = deleted;
        return this;
    };
    CognitoSyncDatasetUpdates.prototype.getMergedDatasetNameList = function() {
        return this.mergedDatasetNameList;
    };
    CognitoSyncDatasetUpdates.prototype.setMergedDatasetNameList = function(mergedList) {
        this.mergedDatasetNameList = mergedList;
        return this;
    };
    return CognitoSyncDatasetUpdates;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.LocalStorage = function() {
    var CognitoSyncLocalStorage = function(options) {
        options = options || {};
        this.store = null;
        this.meta = null;
        if (options.DataStore) {
            this.store = new options.DataStore();
        } else {
            this.store = new AWS.CognitoSyncManager.StoreInMemory();
        }
    };
    CognitoSyncLocalStorage.prototype.getMetadataKey = function(identityId, datasetName) {
        return identityId + "." + datasetName;
    };
    CognitoSyncLocalStorage.prototype.loadMetadataCache = function(identityId, callback) {
        var root = this;
        this.store.get("_internal", "_metadata", identityId, function(err, data) {
            if (err) {
                return callback(err, null);
            }
            if (!data) {
                data = {};
            }
            root.meta = data;
            callback(null, data);
        });
    };
    CognitoSyncLocalStorage.prototype.saveMetadataCache = function(identityId, metadata, callback) {
        this.store.set("_internal", "_metadata", identityId, metadata, function(err) {
            if (err) {
                return callback(err);
            }
            return callback(null, metadata);
        });
    };
    CognitoSyncLocalStorage.prototype.createDataset = function(identityId, datasetName, callback) {
        var root = this;
        this.getDatasetMetadata(identityId, datasetName, function(err, metadata) {
            var stamp = new Date().getTime();
            if (!metadata) {
                metadata = new AWS.CognitoSyncManager.DatasetMetadata({
                    DatasetName: datasetName,
                    CreationDate: stamp,
                    LastModifiedDate: stamp
                });
                root.setDatasetMetadata(identityId, datasetName, metadata, function(err, data) {});
                callback(null, datasetName);
            } else {
                callback(null, datasetName);
            }
        });
        return this;
    };
    CognitoSyncLocalStorage.prototype.getDatasetMetadata = function(identityId, datasetName, callback) {
        var key = this.getMetadataKey(identityId, datasetName);
        if (this.meta !== null) {
            if (this.meta[key]) {
                callback(null, new AWS.CognitoSyncManager.DatasetMetadata(this.meta[key]));
            } else {
                callback(null, undefined);
            }
        } else {
            this.loadMetadataCache(identityId, function(err, cache) {
                if (cache[key]) {
                    callback(null, new AWS.CognitoSyncManager.DatasetMetadata(cache[key]));
                } else {
                    callback(null, undefined);
                }
            });
        }
        return this;
    };
    CognitoSyncLocalStorage.prototype.setDatasetMetadata = function(identityId, datasetName, metadata, callback) {
        this.meta[this.getMetadataKey(identityId, datasetName)] = metadata.toJSON();
        this.saveMetadataCache(identityId, this.meta, callback);
        return this;
    };
    CognitoSyncLocalStorage.prototype.getValue = function(identityId, datasetName, key, callback) {
        this.getRecord(identityId, datasetName, key, function(err, record) {
            if (!record) {
                return callback(null, undefined);
            }
            return callback(null, record.getValue());
        });
    };
    CognitoSyncLocalStorage.prototype.putValue = function(identityId, datasetName, key, value, callback) {
        var root = this;
        this.getRecord(identityId, datasetName, key, function(err, record) {
            if (record && record.getValue() == value) {
                return callback(null, record);
            }
            if (!record) {
                record = new AWS.CognitoSyncManager.Record();
            }
            record.setKey(key).setValue(value).setModified(true).setSyncCount(record ? record.getSyncCount() : 0).setDeviceLastModifiedDate(new Date());
            root.store.set(identityId, datasetName, key, record.toJSON(), function(err) {
                if (err) {
                    return callback(err);
                }
                root.updateLastModifiedTimestamp(identityId, datasetName, function(err) {
                    return callback(err, record);
                });
            });
        });
    };
    CognitoSyncLocalStorage.prototype.getValueMap = function(identityId, datasetName, callback) {
        var values = {};
        var record;
        this.getRecords(identityId, datasetName, function(err, records) {
            for (var r in records) {
                if (records.hasOwnProperty(r)) {
                    record = records[r];
                    if (!record.isDeleted()) {
                        values[record.getKey()] = record.getValue();
                    }
                }
            }
            callback(null, values);
        });
    };
    CognitoSyncLocalStorage.prototype.putAllValues = function(identityId, datasetName, values, callback) {
        var root = this;
        var remain = [];
        for (var v in values) {
            if (values.hasOwnProperty(v)) {
                remain.push(v);
            }
        }
        var request = function(err) {
            var item;
            if (err) {
                return callback(err);
            }
            if (remain.length > 0) {
                item = remain.shift();
                root.putValue(identityId, datasetName, item, values[item], request);
            } else {
                callback(null, true);
            }
        };
        request(null, null);
    };
    CognitoSyncLocalStorage.prototype.getDatasets = function(identityId, callback) {
        var datasets = [];
        if (this.meta !== null) {
            for (var m in this.meta) {
                if (this.meta.hasOwnProperty(m)) {
                    datasets.push(new AWS.CognitoSyncManager.DatasetMetadata(this.meta[m]));
                }
            }
            return callback(null, datasets);
        } else {
            this.loadMetadataCache(identityId, function(err, metadata) {
                for (var m in metadata) {
                    if (metadata.hasOwnProperty(m)) {
                        datasets.push(new AWS.CognitoSyncManager.DatasetMetadata(metadata[m]));
                    }
                }
                return callback(null, datasets);
            });
        }
    };
    CognitoSyncLocalStorage.prototype.updateDatasetMetadata = function(identityId, metadata, callback) {
        var root = this;
        this.getDatasetMetadata(identityId, metadata.getDatasetName(), function(err, local) {
            if (err) {
                callback(err);
            }
            if (!local) {
                local = new AWS.CognitoSyncManager.DatasetMetadata();
            }
            local.setDatasetName(metadata.getDatasetName()).setCreationDate(metadata.getCreationDate()).setLastModifiedDate(metadata.getLastModifiedDate()).setLastModifiedBy(metadata.getLastModifiedBy()).setLastSyncCount(metadata.getLastSyncCount()).setRecordCount(metadata.getRecordCount()).setDataStorage(metadata.getDataStorage());
            root.meta[root.getMetadataKey(identityId, metadata.getDatasetName())] = local.toJSON();
            root.saveMetadataCache(identityId, root.meta, function(err) {
                if (err) {
                    return callback(err);
                }
                return callback(null, local);
            });
        });
    };
    CognitoSyncLocalStorage.prototype.getRecord = function(identityId, datasetName, key, callback) {
        this.store.get(identityId, datasetName, key, function(err, record) {
            if (record) {
                return callback(null, new AWS.CognitoSyncManager.Record(record));
            }
            return callback(new Error("Key doesn't exist."), null);
        });
    };
    CognitoSyncLocalStorage.prototype.getRecords = function(identityId, datasetName, callback) {
        var records = [];
        this.store.getAll(identityId, datasetName, function(err, local) {
            for (var l in local) {
                if (local.hasOwnProperty(l)) {
                    records.push(new AWS.CognitoSyncManager.Record(local[l]));
                }
            }
            callback(null, records);
        });
    };
    CognitoSyncLocalStorage.prototype.putRecords = function(identityId, datasetName, records, callback) {
        var root = this;
        records = records || [];
        records = records.slice();
        var request = function() {
            if (records.length > 0) {
                root.updateAndClearRecord(identityId, datasetName, records.shift(), function(err) {
                    if (err) {
                        return callback(err);
                    }
                    if (records.length === 0) {
                        return callback(null, true);
                    }
                    request();
                });
            }
        };
        request();
    };
    CognitoSyncLocalStorage.prototype.deleteDataset = function(identityId, datasetName, callback) {
        var root = this;
        this.store.removeAll(identityId, datasetName, function(err) {
            if (err) {
                return callback(err);
            }
            root.getDatasetMetadata(identityId, datasetName, function(err, metadata) {
                if (err) {
                    return callback(err);
                }
                metadata.setLastModifiedDate(new Date());
                metadata.setLastSyncCount(-1);
                root.updateDatasetMetadata(identityId, metadata, function(err) {
                    if (err) {
                        return callback(err);
                    }
                    return callback(null, true);
                });
            });
        });
    };
    CognitoSyncLocalStorage.prototype.purgeDataset = function(identityId, datasetName, callback) {
        var root = this;
        this.deleteDataset(identityId, datasetName, function(err) {
            if (err) {
                callback(err);
            }
            delete root.meta[root.getMetadataKey(identityId, datasetName)];
            root.saveMetadataCache(identityId, root.meta, callback);
        });
    };
    CognitoSyncLocalStorage.prototype.getLastSyncCount = function(identityId, datasetName, callback) {
        this.getDatasetMetadata(identityId, datasetName, function(err, metadata) {
            if (metadata) {
                return callback(null, metadata.getLastSyncCount());
            }
            callback(new Error("Dataset doesn't exist."), null);
        });
    };
    CognitoSyncLocalStorage.prototype.getModifiedRecords = function(identityId, datasetName, callback) {
        var modified = [];
        this.getRecords(identityId, datasetName, function(err, records) {
            for (var i = 0; i < records.length; i++) {
                if (records[i].isModified()) {
                    modified.push(records[i]);
                }
            }
            callback(null, modified);
        });
    };
    CognitoSyncLocalStorage.prototype.updateLastSyncCount = function(identityId, datasetName, lastSyncCount, callback) {
        var root = this;
        this.getDatasetMetadata(identityId, datasetName, function(err, meta) {
            if (err) {
                callback(err);
            }
            meta.setLastSyncCount(lastSyncCount).setLastSyncDate(new Date());
            root.updateDatasetMetadata(identityId, meta, function(err) {
                if (err) {
                    callback(err);
                }
                callback(null, true);
            });
        });
    };
    CognitoSyncLocalStorage.prototype.wipeData = function(callback) {
        this.store.wipe(callback);
    };
    CognitoSyncLocalStorage.prototype.updateLastModifiedTimestamp = function(identityId, datasetName, callback) {
        var root = this;
        this.getDatasetMetadata(identityId, datasetName, function(err, meta) {
            if (err) {
                return callback(err);
            }
            meta.setLastModifiedDate(new Date());
            root.updateDatasetMetadata(identityId, meta, function(err) {
                if (err) {
                    return callback(err);
                }
                return callback(null, true);
            });
        });
    };
    CognitoSyncLocalStorage.prototype.removeRecord = function(identityId, datasetName, record) {
        this.store.remove(identityId, datasetName, record, function(err) {
            if (err) {
                return callback(err);
            }
            return callback(null, true);
        });
    };
    CognitoSyncLocalStorage.prototype.updateAndClearRecord = function(identityId, datasetName, record, callback) {
        this.store.set(identityId, datasetName, record.getKey(), record.toJSON(), function(err) {
            if (err) {
                return callback(err);
            }
            return callback(null, true);
        });
    };
    return CognitoSyncLocalStorage;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.Record = function() {
    var CognitoSyncRecord = function(data) {
        data = data || {};
        this.key = data.Key || "";
        this.value = data.Value || "";
        this.syncCount = data.SyncCount || 0;
        this.lastModifiedDate = data.LastModifiedDate ? new Date(data.LastModifiedDate) : new Date();
        this.lastModifiedBy = data.LastModifiedBy || "";
        this.deviceLastModifiedDate = data.DeviceLastModifiedDate ? new Date(data.DeviceLastModifiedDate) : new Date();
        this.modified = data.Modified || false;
    };
    CognitoSyncRecord.prototype.getKey = function() {
        return this.key;
    };
    CognitoSyncRecord.prototype.setKey = function(key) {
        this.key = key;
        return this;
    };
    CognitoSyncRecord.prototype.getValue = function() {
        return this.value;
    };
    CognitoSyncRecord.prototype.setValue = function(value) {
        this.value = value;
        return this;
    };
    CognitoSyncRecord.prototype.getSyncCount = function() {
        return this.syncCount;
    };
    CognitoSyncRecord.prototype.setSyncCount = function(syncCount) {
        this.syncCount = syncCount;
        return this;
    };
    CognitoSyncRecord.prototype.getLastModifiedDate = function() {
        return new Date(this.lastModifiedDate);
    };
    CognitoSyncRecord.prototype.setLastModifiedDate = function(modifiedDate) {
        this.lastModifiedDate = new Date(modifiedDate);
        return this;
    };
    CognitoSyncRecord.prototype.getLastModifiedBy = function() {
        return this.lastModifiedBy;
    };
    CognitoSyncRecord.prototype.setLastModifiedBy = function(modifiedBy) {
        this.lastModifiedBy = modifiedBy;
        return this;
    };
    CognitoSyncRecord.prototype.getDeviceLastModifiedDate = function() {
        return new Date(this.deviceLastModifiedDate);
    };
    CognitoSyncRecord.prototype.setDeviceLastModifiedDate = function(modifiedDate) {
        this.deviceLastModifiedDate = new Date(modifiedDate);
        return this;
    };
    CognitoSyncRecord.prototype.isModified = function() {
        return this.modified;
    };
    CognitoSyncRecord.prototype.setModified = function(modified) {
        this.modified = modified;
        return this;
    };
    CognitoSyncRecord.prototype.isDeleted = function() {
        return this.value === null;
    };
    CognitoSyncRecord.prototype.toString = function() {
        return JSON.stringify(this);
    };
    CognitoSyncRecord.prototype.toJSON = function() {
        return {
            Key: this.key,
            Value: this.value,
            SyncCount: this.syncCount,
            LastModifiedDate: this.lastModifiedDate,
            LastModifiedBy: this.lastModifiedBy,
            DeviceLastModifiedDate: this.deviceLastModifiedDate,
            Modified: this.modified
        };
    };
    return CognitoSyncRecord;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.RemoteStorage = function() {
    var CognitoSyncRemoteStorage = function(identityPoolId, provider) {
        this.identityPoolId = identityPoolId;
        this.provider = provider;
        this.client = new AWS.CognitoSync();
    };
    CognitoSyncRemoteStorage.prototype.userAgent = "";
    CognitoSyncRemoteStorage.prototype.getIdentityId = function() {
        return this.provider.identityId;
    };
    CognitoSyncRemoteStorage.prototype.getDatasets = function(callback) {
        var root = this;
        var datasets = [];
        var nextToken = null;
        var fetch = function(token, cb) {
            root.client.listDatasets({
                IdentityId: root.getIdentityId(),
                IdentityPoolId: root.identityPoolId,
                MaxResults: 64,
                NextToken: token
            }, cb);
        };
        var process = function(err, data) {
            var results = data.Datasets || [];
            for (var i = 0; i < results.length; i++) {
                datasets.push(new AWS.CognitoSyncManager.DatasetMetadata(results[i]));
            }
            nextToken = data.NextToken;
            if (nextToken) {
                fetch(nextToken, process);
            } else {
                callback(null, datasets);
            }
        };
        fetch(nextToken, process);
    };
    CognitoSyncRemoteStorage.prototype.listUpdates = function(datasetName, lastSyncCount, callback) {
        var root = this;
        var nextToken = null;
        var updatedRecords = new AWS.CognitoSyncManager.DatasetUpdates(datasetName);
        var request = function(token, cb) {
            root.client.listRecords({
                DatasetName: datasetName,
                IdentityId: root.getIdentityId(),
                IdentityPoolId: root.identityPoolId,
                LastSyncCount: lastSyncCount,
                MaxResults: 1024,
                NextToken: token
            }, cb);
        };
        var response = function(err, data) {
            if (err) {
                return callback(err);
            }
            data = data || {};
            var results = data.Records || [], r;
            for (var i = 0; i < results.length; i++) {
                r = new AWS.CognitoSyncManager.Record(results[i]);
                r.setModified(false);
                updatedRecords.addRecord(r);
            }
            updatedRecords.setSyncSessionToken(data.SyncSessionToken).setSyncCount(data.DatasetSyncCount).setExists(data.DatasetExists).setDeleted(data.DatasetDeletedAfterRequestedSyncCount);
            if (data.MergedDatasetNames) {
                updatedRecords.setMergedDatasetNameList(data.MergedDatasetNames);
            }
            nextToken = data.NextToken;
            if (nextToken) {
                request(nextToken, response);
            } else {
                callback(null, updatedRecords);
            }
        };
        request(null, response);
    };
    CognitoSyncRemoteStorage.prototype.putRecords = function(datasetName, records, syncSessionToken, callback) {
        var root = this;
        var patches = [];
        var record;
        for (var r in records) {
            if (records.hasOwnProperty(r)) {
                record = records[r];
                patches.push({
                    Key: record.getKey(),
                    Op: record.getValue() ? "replace" : "remove",
                    SyncCount: record.getSyncCount(),
                    DeviceLastModifiedDate: record.getDeviceLastModifiedDate(),
                    Value: record.getValue()
                });
            }
        }
        this.client.updateRecords({
            DatasetName: datasetName,
            IdentityId: root.getIdentityId(),
            IdentityPoolId: root.identityPoolId,
            SyncSessionToken: syncSessionToken,
            RecordPatches: patches
        }, function(err, data) {
            var dsName = typeof datasetName === "string" ? datasetName : "(invalid dataset name)";
            if (err) {
                return callback(new Error("Failed to update records in dataset: " + dsName + " (" + err.message + ")"), null);
            }
            var records = [], r;
            for (var i = 0; i < data.Records.length; i++) {
                r = new AWS.CognitoSyncManager.Record(data.Records[i]);
                r.setModified(false);
                records.push(r);
            }
            return callback(null, records);
        });
    };
    CognitoSyncRemoteStorage.prototype.deleteDataset = function(datasetName, callback) {
        this.client.deleteDataset({
            DatasetName: datasetName,
            IdentityId: this.getIdentityId(),
            IdentityPoolId: this.identityPoolId
        }, function(err, data) {
            if (err) {
                return callback(new Error("Failed to delete dataset."), null);
            }
            return callback(null, data);
        });
    };
    CognitoSyncRemoteStorage.prototype.getDatasetMetadata = function(datasetName, callback) {
        this.client.describeDataset({
            DatasetName: datasetName,
            IdentityId: this.getIdentityId(),
            IdentityPoolId: this.identityPoolId
        }, function(err, data) {
            if (err) {
                return callback(new Error("Failed to get dataset metadata."), null);
            }
            return callback(null, new AWS.CognitoSyncManager.DatasetMetadata(data.Dataset));
        });
    };
    CognitoSyncRemoteStorage.prototype.setUserAgent = function(userAgent) {
        this.userAgent = userAgent;
    };
    return CognitoSyncRemoteStorage;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.StoreInMemory = function() {
    var CognitoSyncStoreInMemory = function() {
        this.store = {};
    };
    CognitoSyncStoreInMemory.prototype.makeKey = function(identityId, datasetName) {
        return identityId + "." + datasetName;
    };
    CognitoSyncStoreInMemory.prototype.get = function(identityId, datasetName, key, callback) {
        var k = this.makeKey(identityId, datasetName);
        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }
        if (this.store[k] && this.store[k][key]) {
            return callback(null, this.store[k][key]);
        }
        return callback(null, undefined);
    };
    CognitoSyncStoreInMemory.prototype.getAll = function(identityId, datasetName, callback) {
        var k = this.makeKey(identityId, datasetName);
        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }
        return callback(null, this.store[k]);
    };
    CognitoSyncStoreInMemory.prototype.set = function(identityId, datasetName, key, value, callback) {
        var k = this.makeKey(identityId, datasetName);
        var entry = this.store[k] || {};
        entry[key] = value;
        this.store[k] = entry;
        return callback(null, entry);
    };
    CognitoSyncStoreInMemory.prototype.setAll = function(identityId, datasetName, obj, callback) {
        var k = this.makeKey(identityId, datasetName);
        this.store[k] = obj;
        return callback(null, obj);
    };
    CognitoSyncStoreInMemory.prototype.remove = function(identityId, datasetName, key, callback) {
        var k = this.makeKey(identityId, datasetName);
        var records = JSON.parse(this.store[k]);
        if (!records) {
            records = {};
        }
        delete records[key];
        this.store[k] = JSON.stringify(records);
        return callback(null, true);
    };
    CognitoSyncStoreInMemory.prototype.removeAll = function(identityId, datasetName, callback) {
        var k = this.makeKey(identityId, datasetName);
        delete this.store[k];
        return callback(null, true);
    };
    CognitoSyncStoreInMemory.prototype.wipe = function(callback) {
        this.store = {};
        return callback(null, true);
    };
    return CognitoSyncStoreInMemory;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.StoreLocalStorage = function() {
    var CognitoSyncStoreLocalStorage = function() {
        this.store = window.localStorage;
    };
    CognitoSyncStoreLocalStorage.prototype.makeKey = function(identityId, datasetName) {
        return identityId + "." + datasetName;
    };
    CognitoSyncStoreLocalStorage.prototype.get = function(identityId, datasetName, key, callback) {
        var k = this.makeKey(identityId, datasetName);
        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }
        var records = JSON.parse(this.store.getItem(k));
        if (records && records[key]) {
            return callback(null, records[key]);
        }
        return callback(null, undefined);
    };
    CognitoSyncStoreLocalStorage.prototype.getAll = function(identityId, datasetName, callback) {
        var k = this.makeKey(identityId, datasetName);
        if (!identityId || !datasetName) {
            return callback(new Error("You must provide an identity id and dataset name."), null);
        }
        return callback(null, JSON.parse(this.store.getItem(k)));
    };
    CognitoSyncStoreLocalStorage.prototype.set = function(identityId, datasetName, key, value, callback) {
        var k = this.makeKey(identityId, datasetName);
        var records = JSON.parse(this.store.getItem(k));
        if (!records) {
            records = {};
        }
        records[key] = value;
        this.store.setItem(k, JSON.stringify(records));
        callback(null, records);
        return this;
    };
    CognitoSyncStoreLocalStorage.prototype.setAll = function(identityId, datasetName, obj, callback) {
        var k = this.makeKey(identityId, datasetName);
        this.store.setItem(k, JSON.stringify(obj));
        return callback(null, obj);
    };
    CognitoSyncStoreLocalStorage.prototype.remove = function(identityId, datasetName, key, callback) {
        var k = this.makeKey(identityId, datasetName);
        var records = JSON.parse(this.store.getItem(k));
        if (!records) {
            records = {};
        }
        delete records[key];
        this.store.setItem(k, JSON.stringify(records));
        return callback(null, true);
    };
    CognitoSyncStoreLocalStorage.prototype.removeAll = function(identityId, datasetName, callback) {
        var k = this.makeKey(identityId, datasetName);
        this.store.removeItem(k);
        return callback(null, true);
    };
    CognitoSyncStoreLocalStorage.prototype.wipe = function(callback) {
        for (var prop in this.store) {
            if (this.store.hasOwnProperty(prop)) {
                if (prop.indexOf("aws.cognito.identity") === -1) {
                    this.store.removeItem(prop);
                }
            }
        }
        if (callback) {
            return callback(null, true);
        }
        return this;
    };
    return CognitoSyncStoreLocalStorage;
}();



AWS.CognitoSyncManager = AWS.CognitoSyncManager || {};

AWS.CognitoSyncManager.StoreSecureStorage = function() {
    var noop = function() {};
    var CognitoSyncStoreSecureStorage = function() {
        this.store = new cordova.plugins.SecureStorage(noop, noop, "dataset");
    };
    CognitoSyncStoreSecureStorage.prototype.makeKey = function(identityId, datasetName) {
        return identityId + "." + datasetName;
    };
    CognitoSyncStoreSecureStorage.prototype.get = function(identityId, datasetName, key, callback) {
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
    CognitoSyncStoreSecureStorage.prototype.getAll = function(identityId, datasetName, callback) {
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
    CognitoSyncStoreSecureStorage.prototype.set = function(identityId, datasetName, key, value, callback) {
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
    CognitoSyncStoreSecureStorage.prototype.setAll = function(identityId, datasetName, obj, callback) {
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
    CognitoSyncStoreSecureStorage.prototype.remove = function(identityId, datasetName, key, callback) {
        var k = this.makeKey(identityId, datasetName);
        var context = this;
        var onSuccess = function(records) {
            if (records) {
                records = JSON.parse(records);
            } else {
                records = {};
            }
            delete records[key];
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
    CognitoSyncStoreSecureStorage.prototype.removeAll = function(identityId, datasetName, callback) {
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
    CognitoSyncStoreSecureStorage.prototype.wipe = function(callback) {
        return callback(null, false);
    };
    return CognitoSyncStoreSecureStorage;
}();