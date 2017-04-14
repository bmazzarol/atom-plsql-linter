'use babel'

const http = require('http')
const exec = require('child_process').exec
const process = require('process')
const packageConfig = require('./config-schema.json');

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
     * @return {Request} active request
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
                'Content-Length': body != null ? Buffer.byteLength(body) : 0
            }
        }, callback)
        // write body
        if (body != null) req.write(body)
        req.end()
        return req
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
        const req = callServer('/check-alive', 'GET', null, (resp) => {
            resp.on('data', () => running())
            resp.on('error', () => notRunning())
        });
        req.on('error', notRunning)
    }

    return {

        config: packageConfig,

        /**
         * Starts the PL/SQL Lint server.
         */
        activate() {
            if (atom.config.get('plsql-linter.startServer')) {
                // check config
                const serverPath = atom.config.get('plsql-linter.plsqlLintServerSrc')
                if (serverPath == null) atom.notifications.addWarning('Location of the PL/SQL Lint server has not been set')
                // start the server
                isRunning(null, () => {
                    const isWin = process.platform == 'win32'
                    const port = atom.config.get('plsql-linter.port')
                    const command = serverPath + '/bin/plsql-lint-server'
                    atom.notifications.addInfo('Starting the PL/SQL Lint Server')
                    exec((isWin ? command.replace('/', '\\') + '.bat' : command) + ' ' + port, (error) => {
                        if (error) {
                            atom.notifications.addError(`Failed to start the PL/SQL Lint Server. ${error}`)
                            return
                        }
                    })
                })
            }
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
                lintsOnChange: true,
                grammarScopes: ['source.plsql.oracle'],
                lint(editor) {
                    const filePath = editor.getPath()
                    const fileText = editor.getText()
                    return new Promise(function(resolve, error) {
                        isRunning(() => callServer(`/lint-file/${encodeURIComponent(filePath)}`, 'POST', fileText, (resp) => {
                            var errors = ''
                            resp.setEncoding('utf8')
                            resp.on('data', (chunk) => errors += chunk)
                            resp.on('end', () => {
                                var ea = []
                                if (errors != null && errors != '') {
                                    ea = JSON.parse(errors)
                                }
                                resolve(ea)
                            })
                            resp.on('error', (e) => error(e))
                        }), () => resolve([]));
                    })
                }
            }
        }
    }
}()

export default plsqlLinter;
