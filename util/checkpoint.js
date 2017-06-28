/*!
 * Copyright (c) 2017, Okta, Inc. and/or its affiliates. All rights reserved.
 * The Okta software accompanied by this notice is provided pursuant to the Apache License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and limitations under the License.
 */

const Promise = require('bluebird');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);
const ConcurrencyPool = require('./concurrency-pool');
const { info } = require('./logger');

class BaseCheckpoint {

  /**
   * @return {object} config - path, type, properties
   */
  checkpointConfig() {
    throw new Error('checkpointConfig must be implemented');
  }

  getCheckpointPathFromType(type) {
    return path.resolve(
      config.checkpointDir,
      `${this.checkpointConfig().path}.${type}`
    );
  }

  readFile() {
    const filePath = this.getCheckpointPath();
    if (!fs.existsSync(filePath)) {
      return this.parseFile(null);
    }
    return this.parseFile(fs.readFileSync(filePath, 'utf8'));
  }

  async readFileAsync() {
    const filePath = this.getCheckpointPath();
    try {
      const content = await readFile(filePath, 'utf8');
      return this.parseFile(content);
    } catch (e) {
      return this.parseFile(null);
    }
  }

  writeFile(content) {
    const filePath = this.getCheckpointPath();
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, content);
  }

  async writeFileAsync(content) {
    const filePath = this.getCheckpointPath();
    await fs.ensureDir(path.dirname(filePath));
    await writeFile(filePath, content);
  }

  appendFile(content) {
    const filePath = this.getCheckpointPath();
    fs.ensureDirSync(path.dirname(filePath));

    if (fs.existsSync(filePath)) {
      fs.appendFileSync(filePath, '\n' + content);
    }
    else {
      fs.writeFileSync(filePath, content);
    }
  }

}

class JsonCheckpoint extends BaseCheckpoint {

  getCheckpointPath() {
    return this.getCheckpointPathFromType('json');
  }

  parseFile(content) {
    return content ? JSON.parse(content) : {};
  }

  setProperties(props) {
    Object.keys(props).forEach((key) => {
      this[key] = props[key];
    });
  }

  getProperties() {
    const props = {};
    this.checkpointConfig().props.forEach(key => props[key] = this[key]);
    return props;
  }

  save() {
    const props = this.getProperties();
    this.writeFile(JSON.stringify(props, null, 2));
  }

  async saveAsync() {
    const props = this.getProperties();
    await this.writeFileAsync(JSON.stringify(props, null, 2));
  }

  restore() {
    this.setProperties(this.readFile());
  }

  async restoreAsync() {
    const props = await this.readFileAsync();
    this.setProperties(props);
  }

}

class LogCheckpoint extends BaseCheckpoint {

  constructor(path) {
    super();
    this.path = path;
    this.pendingItems = [];
  }

  checkpointConfig() {
    return { path: this.path };
  }

  add(item) {
    this.pendingItems.push(item);
  }

  getCheckpointPath() {
    return this.getCheckpointPathFromType('txt');
  }

  parseFile(content) {
    return content ? content.split('\n') : [];
  }

  save() {
    this.appendFile(this.pendingItems.join('\n'));
    this.pendingItems = [];
  }

  async processAsync(processFn, limit) {
    info(`Loading log checkpoint file ${this.path}`);
    const items = await this.readFileAsync();
    if (items.length === 0) {
      return;
    }

    info(`Processing ${items.length} log items`);
    const pool = new ConcurrencyPool(limit);
    await pool.each(items, async (item) => {
      if (!item) {
        return;
      }
      await processFn(item);
    });
  }

  process(processFn) {
    info(`Loading log checkpoint file ${this.path}`);
    const items = this.readFile();
    if (items.length === 0) {
      return;
    }

    info(`Processing ${items.length} log items`);
    for (let item of items) {
      if (!item) {
        continue;
      }
      processFn(item);
    }
  }

}

module.exports = { JsonCheckpoint, LogCheckpoint }
