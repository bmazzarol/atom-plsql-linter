'use babel'

const http = require('http')
const exec = require('child_process').exec
const process = require('process')
const packageConfig = require('./config-schema.json')
const fs = require('fs')

/**
 * Main PL/SQL linter module.
 */
const plsqlLinter = function() {

  // constants that are not configurable
  const configFileName = '.oraclelint.json'
  const isWin = process.platform == 'win32'
  const disposables = [] // list of items to call dispose on on shutdown
  const supportedServerVersion = '1.0.3'
  var currentServerVersion = null

  /**
   * Checks that the correct version of the server is running.
   */
  function checkVersion() {
    if (currentServerVersion == null) {
      isRunning(() => {
        callServer('/version', 'GET', null, (versionString) => {
          currentServerVersion = JSON.parse(versionString)
          if (currentServerVersion != supportedServerVersion) {
            atom.notifications.addError(`This plugin supports the ${supportedServerVersion} version of the PL/SQL Lint Server. The current version you are running is ${currentServerVersion}.`)
          }
        })
      })
    }
  }

  /**
   * Calls the PL/SQL lint server.
   *
   * @param  {string}   path       resource path
   * @param  {string}   method     request method, either POST or GET
   * @param  {string}   body       data to post
   * @param  {Function} onComplete function accepting a response body
   * @param  {Function} onError    function accepting a error message
   * @return {Request}             active request
   * @private
   */
  function callServer(path, method, body, onComplete, onError) {
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
    }, (resp) => {
      var buffer = ''
      resp.setEncoding('utf8')
      resp.on('data', (chunk) => buffer += chunk)
      resp.on('end', () => {
        if (onComplete) onComplete(buffer)
      })
      resp.on('error', (e) => {
        if (onError) onError(e)
      })
    })
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
    const req = callServer('/check-alive', 'GET', null, running, notRunning)
    req.on('error', notRunning)
  }

  // configs for the open projects, index by path
  var configs = {}
  // directories to watch
  var disposableDirectories = {}
  // disposable configs to clean up when file is removed
  var disposableConfigs = {}

  /**
   * Sets the config files to memory.
   */
  function setConfigFiles() {

    /**
     * Removes a watcher on a config file.
     *
     * @param  {string} path project path
     */
    function unwatchConfig(path) {
      if (disposableConfigs[path] != null) {
        disposableConfigs[path].dispose()
        delete disposableConfigs[path]
        delete configs[path]
      }
    }

    /**
     * Watches a config for a project direcetory.
     *
     * @param  {Directory} projectDir project directory
     */
    function watchConfig(projectDir) {

      /**
       * Loads a config file to memory.
       *
       * @param  {File} configFile .plsqllint.json file to load into memory
       * @return {oject}            config object created
       */
      function loadConfig(configFile) {
        const key = configFile.getParent().getPath()
        // create a path
        configs[key] = {}
        // load config into memory
        fs.readFile(configFile.getPath(), 'utf8', (err, data) => {
          try {
            if (data != null && data != '')
              configs[key] = JSON.parse(data)
          } catch (e) {
            atom.notifications.addError(`Failed to parse .plsqllint.json file ${configFile.getPath()}: ${e}`)
          }
        })
        return configs[key]
      }

      const pDir = [projectDir]

      pDir // exclude the directories already loaded
        .filter((d) => configs[d.getPath()] == null)
        // get the config file
        .map((d) => d.getFile(configFileName))
        // exclude the files that don't exist
        .filter((cf) => cf.existsSync())
        // add listener on the file
        .forEach((config) => {
          loadConfig(config)
          // add listener for changes to file
          const configDisp = config.onDidChange(() => loadConfig(config))
          disposables.push(configDisp)
          disposableConfigs[config.getParent().getPath()] = configDisp
        })

      pDir // clean up orphened files
        .filter((d) => configs[d.getPath()] != null && !d.getFile(configFileName).existsSync())
        .forEach((config) => unwatchConfig(config.getPath()))
    }

    // add watchers on the project directories
    atom.project.getDirectories()
      .filter((d) => disposableDirectories[d.getPath()] == null)
      .forEach((dir) => {
        watchConfig(dir)
        const dirDisp = dir.onDidChange(() => watchConfig(dir))
        // add listener for changes to directory
        disposableDirectories[dir.getPath()] = dirDisp
        disposables.push(dirDisp)
      })

    // clean up orphened directories
    Object.keys(disposableDirectories)
      .filter((path) => {
        !atom.project.getDirectories()
          .map((d) => d.getPath())
          .includes(path)
      })
      .forEach((path) => {
        // stop watching any configs
        unwatchConfig(path)
        // remove project watchers
        disposableDirectories[path].dispose()
        delete disposableDirectories[path]
      })
  }

  /**
   * Returns the project key for the given project file.
   *
   * @param  {string} path file path
   * @return {string}      project key for the given project file
   */
  function getProjectKey(path) {
    var key = null
    atom.project.getDirectories()
      .filter((d) => path.startsWith(d.getPath()))
      .forEach((d) => key = d.getPath())
    return key
  }

  /**
   * Returns true if the project has added filters.
   *
   * @param  {string}  projectKey project to check to filters for
   * @return {Boolean}            true if there are filters added.
   */
  function hasFilters(projectKey) {
    return configs[projectKey] != null && configs[projectKey].filters != null
  }

  /**
   * Returns any configured filters for the given project file.
   *
   * @param  {string} path path to return filters for
   * @return {array}       array of filters to apply
   */
  function getFilters(path) {
    const projectKey = getProjectKey(path)
    // returns the filters
    if (hasFilters(projectKey))
      return configs[projectKey].filters
    // there are no filters
    else return []
  }

  /**
   * Starts the plsql lint server.
   */
  function startLintServer() {
    if (atom.config.get('plsql-linter.startServer')) {
      // check config
      const serverPath = atom.config.get('plsql-linter.plsqlLintServerSrc')
      if (serverPath == null) atom.notifications.addWarning('Location of the PL/SQL Lint server has not been set')
      // start the server
      isRunning(null, () => {
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
  }

  return {
    // linter config
    config: packageConfig,

    /**
     * Starts the PL/SQL Lint server.
     */
    activate() {
      // setup configs
      setConfigFiles()
      // add listener on change to project
      disposables.push(atom.project.onDidChangePaths(() => setConfigFiles()))
      // start the server
      startLintServer()
      disposables.push(atom.config.observe('plsql-linter.startServer', () => startLintServer()))
    },

    /**
     * Cleans up the linter plugin.
     */
    deactivate() {
      // dispose of all listeners
      disposables.forEach((d) => d.dispose())
    },

    /**
     * Creates an instance of the PL/SQL Linter.
     *
     * @return {object} linter
     */
    provideLinter() {
      // create handle on linter
      const linter = {
        name: 'plsql-linter',
        scope: 'file',
        lintsOnChange: atom.config.get('plsql-linter.lintOnChange'),
        grammarScopes: ['source.plsql.oracle'],
        lint(editor) {
          const filePath = editor.getPath()
          const fileText = editor.getText()
          return new Promise(function(resolve, error) {
            // check that the correct version of the server is running
            checkVersion()
            // lint file
            isRunning(() => callServer('/lint-file', 'POST',
                // request body
                JSON.stringify({
                  path: filePath,
                  content: fileText,
                  filters: getFilters(filePath)
                }),
                // on complete
                (errors) => {
                  var ea = []
                  if (errors != null && errors != '' && errors.startsWith('[') && errors.endsWith(']')) {
                    ea = JSON.parse(errors)
                  } else {
                    error(errors)
                  }
                  resolve(ea)
                },
                // on error
                (e) => error(e)),
              // on server not running
              () => resolve([]))
          })
        }
      }
      // on change to config item, update linter config
      disposables.push(atom.config.observe('plsql-linter.lintOnChange', (value) => linter.lintsOnChange = value))
      // return linter
      return linter
    }
  }
}()

export default plsqlLinter
