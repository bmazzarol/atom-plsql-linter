'use babel'

export function activate() {
  // Fill something here, optional
}

export function deactivate() {
  // Fill something here, optional
}

export function provideLinter() {
  const options = {
    host: "localhost",
    port: 9876,
    path: '/',
    method: 'POST'
  };

  return {
    name: 'Example',
    scope: 'file', // or 'project'
    lintsOnChange: false, // or true
    grammarScopes: ['source.sql', "source.pks", "source.pkb"],
    lint(textEditor) {
       const filePath = editor.getPath();
       const fileText = editor.getText();

      // Do something async
      return new Promise(function(resolve) {
        // set path
        options.path = '/' + editorPath;

        resolve([{
          severity: 'info',
          location: {
            file: editorPath,
            position: [[0, 0], [0, 1]],
          },
          excerpt: `A random value is ${Math.random()}`,
          description: `### What is this?\nThis is a randomly generated value`
        }])
      })
    }
  }
}
