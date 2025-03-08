// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    json(), // Add this plugin first
    typescript(),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
  ],
  // Mark node_modules as external to avoid bundling them
  external: [
    /node_modules/,
    'dotenv',
    'winston',
    'octokit',
    '@octokit/graphql',
    '@octokit/plugin-paginate-graphql',
    '@octokit/plugin-throttling',
    'execa',
    'shell-quote',
    '@fast-csv/parse',
    'csv-stringify',
    'undici',
  ],
};

export default config;
