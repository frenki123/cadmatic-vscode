const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/extension.ts',
    target: 'node',
    output: {
        filename: 'extension.js',
        path: path.resolve(__dirname, 'out'),
        libraryTarget: 'commonjs2'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    externals: {
        vscode: 'commonjs vscode'
    },
    devtool: 'source-map'
};
