'use babel'

import http from 'http'
import buffer from 'buffer'
import atom from 'atom'
import console from 'console'
import require from 'require'
const spawn = require('child_process').spawn
import process from 'process'
import packageConfig from './config-schema.json';

/**
 * Main PL/SQL linter module.
 */
const plsqlLinter = function() {

    /**
     * Calls the PL/SQL lint server.
     *
     * @param  {string}   path     resource path
     * @param  {string}   method   request method, either POST or GET
     * @param  {string}   body     data to post
     * @param  {Function} callback function accepting a response
     * @private
     */
    function callServer(path, method, body, callback) {
        // create server request
        const req = http.request({
            host: 'localhost',
            port: atom.config.get('plsql-linter.port'),
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/JSON',
                'Content-Length': body != null ? buffer.byteLength(body) : 0
            }
        }, callback)
        // write body
        if (body != null) req.write(body)
        req.end()
    }

    /**
     * Checks if the PL/SQL Lint server is running, and then allows for logic in each case.
     *
     * @param  {function}  running    task to run if the server is running
     * @param  {function}  notRunning task to run if the server is no running
     * @private
     */
    function isRunning(running, notRunning) {
        running = running || (() => {})
        notRunning = notRunning || (() => {})
        callServer('/check-alive', 'GET', null, (resp) => {
            resp.on('data', () => running())
            resp.on('error', () => notRunning())
        });
    }

    return {

        config: packageConfig,

        /**
         * Starts the PL/SQL Lint server.
         */
        activate() {
            // check config
            const serverPath = atom.config.get('plsql-linter.plsqlLintServerSrc')
            if (serverPath == null) throw 'Location of the PL/SQL Lint server has not been set'
            // start the server
            isRunning(null, () => {
                const isWin = process.platform == 'win32'
                const command = serverPath + '/bin/plsql-lint-server'
                const server = spawn(isWin ? command.replace('/', '\\') + '.bat' : command, [atom.config.get('plsql-linter.port')])
                server.stdout.on('data', console.log)
            })
        },

        /**
         * Stops the PL/SQL Lint server.
         */
        deactivate() {
            // kill the server
            isRunning(() => {
                callServer('/shutdown', 'GET', null, (resp) => {
                    resp.on('data', () => console.log('PL/SQL Lint server has stopped.'))
                    resp.on('error', (error) => {
                        throw `Failed to shutdown PL/SQL Lint Server, check that it was running. ${error}`
                    })
                })
            })
        },

        /**
         * Creates an instance of the PL/SQL Linter.
         *
         * @return {object} linter
         */
        provideLinter() {
            return {
                name: 'plsql-linter',
                scope: 'file',
                lintsOnChange: true, // if performance is an issue set this to false
                grammarScopes: ['source.sql', 'source.pks', 'source.pkb'],
                lint(editor) {
                    const filePath = editor.getPath()
                    const fileText = editor.getText()
                    return new Promise(function(resolve, error) {
                        isRunning(() => callServer('/' + filePath, 'POST', fileText, (resp) => {
                            var errors = ''
                            resp.setEncoding('utf8')
                            resp.on('data', (chunk) => errors += chunk)
                            resp.on('end', () => resolve(JSON.parse(errors)))
                            resp.on('error', (e) => error(e))
                        }));
                    })
                }
            }
        }
    }
}()

export default plsqlLinter;
