'use babel'

import http from "http";
import Buffer from "Buffer";

export function activate() {
    // setup the lint server
}

export function deactivate() {
    // destory the lint server
}

export function provideLinter() {
    const options = {
        host: "localhost",
        port: 9876,
        path: '/',
        method: 'POST'
    }
    return {
        name: 'plsql-linter',
        scope: 'file',
        lintsOnChange: true, // if performance is an issue set this to false
        grammarScopes: ['source.sql', "source.pks", "source.pkb"],
        lint(editor) {
            const filePath = editor.getPath()
            const fileText = editor.getText()
            return new Promise(function(resolve) {
                // set path
                options.path = '/' + filePath
                options.headers = {
                    'Content-Type': 'application/JSON',
                    'Content-Length': Buffer.byteLength(fileText)
                }
                // call the lint server
                const req = http.request(options, (resp) => {
                    var errors = ""
                    resp.setEncoding('utf8')
                    resp.on("data", (chunk) => errors += chunk)
                    resp.on("end", () => resolve(JSON.parse(errors)))
                })
                // write buffer to lint
                req.write(fileText)
                req.end()
            })
        }
    }
}
