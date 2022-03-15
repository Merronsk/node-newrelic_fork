/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const tap = require('tap')
const helper = require('../../lib/agent_helper')
const params = require('../../lib/params')
const setup = require('./setup')

const { USER, DATABASE } = setup

tap.test('MySQL transactions', { timeout: 30000 }, function (t) {
  t.plan(3)

  // set up the instrumentation before loading MySQL
  const agent = helper.instrumentMockedAgent()
  const mysql = require('mysql2')

  setup(mysql).then(() => {
    const client = mysql.createConnection({
      user: USER,
      database: DATABASE,
      host: params.mysql_host,
      port: params.mysql_port
    })

    t.teardown(function () {
      helper.unloadAgent(agent)
      client.end()
    })

    t.notOk(agent.getTransaction(), 'no transaction should be in play yet')
    helper.runInTransaction(agent, function transactionInScope() {
      t.ok(agent.getTransaction(), 'we should be in a transaction')
      client.beginTransaction(function (err) {
        if (err) {
          return t.fail(err)
        }
        // trying the object mode of client.query
        client.query({ sql: 'SELECT 1', timeout: 10 }, function (err) {
          if (err) {
            return t.fail(err)
          }
          client.commit(function (err) {
            if (err) {
              return t.fail(err)
            }
            t.ok(agent.getTransaction(), 'MySQL query should not lose the transaction')
          })
        })
      })
    })
  })
})
