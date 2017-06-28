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

const Account = require('./account');
const JsonCheckpoint = require('../util/checkpoint').JsonCheckpoint;

class AccountRef extends JsonCheckpoint {

  constructor(id) {
    super();
    this.id = id;
  }

  checkpointConfig() {
    return {
      path: `account-refs/${this.id}`,
      props: ['id', 'oktaUserId', 'username', 'email', 'accountFilePath']
    };
  }

  getAccount() {
    const account = new Account(this.accountFilePath);
    account.restore();
    return account;
  }

  async getAccountAsync() {
    const account = new Account(this.accountFilePath);
    await account.restoreAsync();
    return account;
  }

}

module.exports = AccountRef;
