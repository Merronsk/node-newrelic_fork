/*
 * Copyright 2022 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const Config = require('../../../lib/config')
const tap = require('tap')

tap.test('Configuration Library', (t) => {
  t.autoend()

  let originalConsoleError

  t.beforeEach(() => {
    // Make sure we don't pollute our logs
    originalConsoleError = global.console.error
    global.console.error = () => {}
  })

  t.afterEach(() => {
    // Restore so we don't have a knock-on effect with other test suites
    global.console.error = originalConsoleError
  })

  t.test('should gracefully handle errors on instantiation', (t) => {
    t.teardown(() => {
      delete process.env.NEW_RELIC_NO_CONFIG_FILE
      delete process.env.NEW_RELIC_HOME
      delete process.env.NEW_RELIC_HIGH_SECURITY
      delete process.env.NEW_RELIC_SECURITY_POLICIES_TOKEN
    })

    process.env.NEW_RELIC_NO_CONFIG_FILE = 'true'
    process.env.NEW_RELIC_HOME = '/xxxnoexist/nofile'
    process.env.NEW_RELIC_HIGH_SECURITY = 'true'
    process.env.NEW_RELIC_SECURITY_POLICIES_TOKEN = 'faketoken-noexist'

    const config = Config.getOrCreateInstance()
    t.notOk(config.agent_enabled, 'should disable the agent on error')
    t.has(
      config.logging,
      { enabled: true, filepath: 'stdout' },
      'should default the logging configuration on error'
    )

    t.end()
  })
})
