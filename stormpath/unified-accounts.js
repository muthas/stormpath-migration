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
const logger = require('../util/logger');

function warn(account, msg) {
  logger.warn(`Account id=${account.id} email=${account.email} ${msg}`);
}

function getEmailPrefix(email) {
  return email.substring(0, email.indexOf('@'));
}

class UnifiedAccounts {

  constructor(accountLinks) {
    this.accountLinks = accountLinks;
    this.emailMap = {};
    this.stormpathAccountIdMap = {};
    this.loginPrefixAccountMap = {};
    this.convertedLoginAccounts = [];
  }

  addAccount(account) {
    const linkedAccountIds = this.accountLinks.getLinkedAccounts(account.id);

    // Verify account is not linked to a previously processed account with a
    // different email address
    const linkedAccounts = linkedAccountIds.map(id => this.stormpathAccountIdMap[id]);
    for (let linkedAccount of linkedAccounts) {
      if (linkedAccount && linkedAccount.email !== account.email) {
        warn(account, `is linked to id=${linkedAccount.id} email=${linkedAccount.email}, but email is different. Skipping.`);
        return;
      }
    }

    // Verify account does not have the same email as a previously processed
    // account that it is not linked to
    const emailAccount = this.emailMap[account.email];
    if (emailAccount && !linkedAccountIds.includes(emailAccount.id)) {
      warn(account, `has same email address as id=${emailAccount.id}, but is not linked. Skipping.`);
      return;
    }

    // If there is an existing account, merge it and return the merged account
    if (emailAccount) {
      emailAccount.merge(account);
      this.stormpathAccountIdMap[account.id] = emailAccount;
      logger.info(`Merged account id=${account.id} email=${account.email} into linked account id=${emailAccount.id}`);
      return emailAccount;
    }

    // By default, an Okta login must be formatted as an email address. If the
    // Stormpath username is not an email address, convert it by appending
    // @emailnotprovided.local.
    //
    // This will normally be okay for most cases - the email domain is not
    // necessary for a login lookup. However, for more complicated cases,
    // contact support to enable the REMOVE_EMAIL_FORMAT_LOGIN_RESTRICTION flag.
    if (!account.username.includes('@')) {
      const updated = `${account.username}@emailnotprovided.local`;
      logger.warn(`Account id=${account.id} username=${account.username} username is not an email. Using username=${updated}.`);
      account.username = updated;
      this.convertedLoginAccounts.push(account);
    }


    logger.silly(`Adding new account id=${account.id}`);
    this.emailMap[account.email] = account;
    this.stormpathAccountIdMap[account.id] = account;

    const loginPrefix = getEmailPrefix(account.username);
    if (!this.loginPrefixAccountMap[loginPrefix]) {
      this.loginPrefixAccountMap[loginPrefix] = [];
    }
    this.loginPrefixAccountMap[loginPrefix].push(account);

    return account;
  }

  getAccounts() {
    return Object.values(this.emailMap);
  }

  getAccountsByEmail() {
    return this.emailMap;
  }

  getUserIdByAccountId(accountId) {
    const account = this.stormpathAccountIdMap[accountId];
    if (!account) {
      return null;
    }
    return account.getOktaUserId();
  }

  getMissingAccounts(accountIds) {
    return accountIds.filter(accountId => !this.getUserIdByAccountId(accountId));
  }

  getUserIdsByAccountIds(accountIds) {
    const userIds = [];
    for (let accountId of accountIds) {
      const userId = this.getUserIdByAccountId(accountId);
      if (userId) {
        userIds.push(userId);
      }
    }
    return userIds;
  }

  /**
   * Problem usernames are defined as:
   * - Originally not an email address (@emailnotprovided.local appended)
   * - Have the same login prefix as another Stormpath username.
   *
   * For example, for two accounts:
   * - username1: susan -> susan@emailnotprovided.local
   * - username2: susan@example.com
   *
   * When logging in, susan@example.com will be used to logging in with the
   * previous 'susan@example.com' username. She is fine.
   *
   * However, susan@emailnotprovided.local will be used to logging in as
   * 'susan'. However, her new login is 'susan@emailnotprovided.local'.
   *
   * Note: If susan@example.com does not exist, susan@emailnotprovided.local
   * will be able to login with either 'susan' or 'susan@emailnotprovided.local'.
   * The domain is only necessary when there are multiple users with the same
   * login prefix.
   */
  getProblemUsernameAccounts() {
    const problems = [];
    for (let account of this.convertedLoginAccounts) {
      const prefix = getEmailPrefix(account.username);
      const prefixAccounts = this.loginPrefixAccountMap[prefix];
      const conflicts = prefixAccounts.filter((prefixAccount) => {
        return prefixAccount.id !== account.id;
      });
      if (conflicts.length > 0) {
        problems.push({ account, conflicts });
      }
    }
    return problems;
  }

}

module.exports = UnifiedAccounts;
