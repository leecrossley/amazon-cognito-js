module.exports = function(grunt) {

    grunt.initConfig({

        pkg: grunt.file.readJSON('package.json'),

        banner: '/**\n' +
        ' * Copyright 2014 Amazon.com,\n' +
        ' * Inc. or its affiliates. All Rights Reserved.\n' +
        ' * \n' +
        ' * Licensed under the Amazon Software License (the "License").\n' +
        ' * You may not use this file except in compliance with the\n' +
        ' * License. A copy of the License is located at\n' +
        ' * \n' +
        ' *     http://aws.amazon.com/asl/\n' +
        ' * \n' +
        ' * or in the "license" file accompanying this file. This file is\n' +
        ' * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR\n' +
        ' * CONDITIONS OF ANY KIND, express or implied. See the License\n' +
        ' * for the specific language governing permissions and\n' +
        ' * limitations under the License. \n' +
        ' */\n\n',

        jshint: {

            options: {
                browser: true,
                globals: {
                    AWS: true
                }
            },

            src: ['src/*.js']

        },

        uglify: {
            options: {
                sourceMap: false,
                drop_console: true,
                compress: false,
                mangle: false,
                beautify: true,
                banner: '<%= banner %>'
            },
            dist: {
                files: {
                    "dist/cognito-manager.js": [
                        'src/CognitoSyncManager.js',
                        'src/CognitoSyncConflict.js',
                        'src/CognitoSyncDataset.js',
                        'src/CognitoSyncDatasetMetadata.js',
                        'src/CognitoSyncDatasetUpdates.js',
                        'src/CognitoSyncLocalStorage.js',
                        'src/CognitoSyncRecord.js',
                        'src/CognitoSyncRemoteStorage.js',
                        'src/CognitoSyncStoreInMemory.js',
                        'src/CognitoSyncStoreLocalStorage.js',
                        'src/CognitoSyncStoreSecureStorage.js'
                    ]
                }
            }
        },

        watch: {
            scripts: {
                files: ['src/*.js'],
                tasks: ['default']
            }
        },

        replace : {
            main : {
                src: ['dist/*.js'],
                overwrite: true,
                replacements: [{
                    from: 'var AWS = require("aws-sdk");',
                    to: ''
                }]
            }
        }

    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-text-replace');

    grunt.registerTask('default', ['jshint', 'uglify', 'replace']);

};
