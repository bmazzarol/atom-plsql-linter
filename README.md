# atom-plsql-linter
PL/SQL linter for the Atom text editor based on the [Trivadis PL/SQL COP](https://www.salvis.com/blog/plsql-cop/).

Uses the [PL/SQL Lint Server](https://github.com/bmazzarol/plsql-lint-server) to provide linting for oracle files.

This version of the plugin is designed to run against the 1.0.2 version of the [PL/SQL Lint Server](https://github.com/bmazzarol/plsql-lint-server).

## Custom issue filters
A file with the name .oraclelint.json can be added to the project folder to define exclusions to issues you wish to ignore.

The format of the file is,

    {
        "filters": [
            // global filters which apply to all files in the project
            {
                "codes": ["G-1200",...] // issue numbers
            },
            // file specific filter
            {
                "path": "/absolute/path/to/file/in/project/somefile.sql",
                "codes": ["G-2341",...], // issue numbers
                "includeGlobal": true // flag to indicate that the global filters should also be included
            }
        ]
    }
