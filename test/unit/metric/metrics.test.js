/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// TODO: convert to normal tap style.
// Below allows use of mocha DSL with tap runner.
require('tap').mochaGlobals()

const chai = require('chai')
const expect = chai.expect
const helper = require('../../lib/agent_helper')
const Metrics = require('../../../lib/metrics')
const MetricMapper = require('../../../lib/metrics/mapper')
const MetricNormalizer = require('../../../lib/metrics/normalizer')

describe('Metrics', function () {
  let metrics
  let agent

  beforeEach(function () {
    agent = helper.loadMockedAgent()
    metrics = new Metrics(agent.config.apdex_t, agent.mapper, agent.metricNameNormalizer)
  })

  afterEach(function () {
    helper.unloadAgent(agent)
  })

  describe('when creating', function () {
    it('should throw if apdexT is not set', function () {
      expect(function () {
        metrics = new Metrics(undefined, agent.mapper, agent.metricNameNormalizer)
      }).throws()
    })

    it('should throw if no name -> ID mapper is provided', function () {
      expect(function () {
        metrics = new Metrics(agent.config.apdex_t, undefined, agent.metricNameNormalizer)
      }).throws()
    })

    it('should throw if no metric name normalizer is provided', function () {
      expect(function () {
        metrics = new Metrics(agent.config.apdex_t, agent.mapper, undefined)
      }).throws()
    })

    it('should return apdex summaries with an apdexT same as config', function () {
      const metric = metrics.getOrCreateApdexMetric('Apdex/MetricsTest')
      expect(metric.apdexT).equal(agent.config.apdex_t)
    })

    it('should allow overriding apdex summaries with a custom apdexT', function () {
      const metric = metrics.getOrCreateApdexMetric('Apdex/MetricsTest', null, 1)
      expect(metric.apdexT).equal(0.001)
    })

    it('should require the overriding apdex to be greater than 0', function () {
      const metric = metrics.getOrCreateApdexMetric('Apdex/MetricsTest', null, 0)
      expect(metric.apdexT).equal(agent.config.apdex_t)
    })

    it('should require the overriding apdex to not be negative', function () {
      const metric = metrics.getOrCreateApdexMetric('Apdex/MetricsTest', null, -5000)
      expect(metric.apdexT).equal(agent.config.apdex_t)
    })
  })

  describe('when creating with parameters', function () {
    const TEST_APDEX = 0.4
    const TEST_MAPPER = new MetricMapper([[{ name: 'Renamed/333' }, 1337]])
    const TEST_NORMALIZER = new MetricNormalizer({ enforce_backstop: true }, 'metric name')

    beforeEach(function () {
      TEST_NORMALIZER.addSimple(/^Test\/RenameMe(.*)$/, 'Renamed/$1')
      metrics = new Metrics(TEST_APDEX, TEST_MAPPER, TEST_NORMALIZER)
    })

    it('should pass apdex through to ApdexStats', function () {
      const apdex = metrics.getOrCreateApdexMetric('Test/RenameMe333')
      expect(apdex.apdexT).equal(TEST_APDEX)
    })

    it('should pass metric mappings through for serialization', function () {
      metrics.measureMilliseconds('Test/RenameMe333', null, 400, 300)
      const summary = JSON.stringify(metrics.toJSON())
      expect(summary).equal('[[1337,[1,0.4,0.3,0.4,0.4,0.16000000000000003]]]')
    })
  })

  describe('when creating individual metrics', function () {
    it('should create a metric when a nonexistent name is requested', function () {
      const metric = metrics.getOrCreateMetric('Test/Nonexistent', 'TEST')
      expect(metric).to.have.property('callCount')
    })

    it('should have statistics available', function () {
      const metric = metrics.getOrCreateMetric('Agent/Test')
      expect(metric).to.have.property('callCount')
    })

    it('should have have regular functions', function () {
      const metric = metrics.getOrCreateMetric('Agent/StatsTest')
      expect(metric).to.have.property('incrementCallCount')
    })
  })

  describe('when creating individual apdex metrics', function () {
    it('should have apdex functions', function () {
      const metric = metrics.getOrCreateApdexMetric('Agent/ApdexTest')
      expect(metric).to.have.property('incrementFrustrating')
    })
  })

  it('should measure an unscoped metric', function () {
    metrics.measureMilliseconds('Test/Metric', null, 400, 200)
    expect(JSON.stringify(metrics.toJSON())).equal(
      '[[{"name":"Test/Metric"},[1,0.4,0.2,0.4,0.4,0.16000000000000003]]]'
    )
  })

  it('should measure a scoped metric', function () {
    metrics.measureMilliseconds('T/M', 'T', 400, 200)
    expect(JSON.stringify(metrics.toJSON())).equal(
      '[[{"name":"T/M","scope":"T"},[1,0.4,0.2,0.4,0.4,0.16000000000000003]]]'
    )
  })

  it('should resolve the correctly scoped set of metrics when scope passed', function () {
    metrics.measureMilliseconds('Apdex/ScopedMetricsTest', 'TEST')
    const scoped = metrics._resolve('TEST')

    expect(scoped['Apdex/ScopedMetricsTest']).an('object')
  })

  it('should implicitly create a blank set of metrics when resolving new scope', () => {
    const scoped = metrics._resolve('NOEXISTBRO')

    expect(scoped).an('object')
    expect(Object.keys(scoped).length).equal(0)
  })

  it('should return a preëxisting unscoped metric when it is requested', function () {
    metrics.measureMilliseconds('Test/UnscopedMetric', null, 400, 200)
    expect(metrics.getOrCreateMetric('Test/UnscopedMetric').callCount).equal(1)
  })

  it('should return a preëxisting scoped metric when it is requested', function () {
    metrics.measureMilliseconds('Test/Metric', 'TEST', 400, 200)
    expect(metrics.getOrCreateMetric('Test/Metric', 'TEST').callCount).equal(1)
  })

  it('should return the unscoped metrics when scope not set', function () {
    metrics.measureMilliseconds('Test/UnscopedMetric', null, 400, 200)
    expect(Object.keys(metrics._resolve()).length).equal(1)
    expect(Object.keys(metrics.scoped).length).equal(0)
  })

  it('should measure bytes ok', function () {
    const MEGABYTE = 1024 * 1024
    const stat = metrics.measureBytes('Test/Bytes', MEGABYTE)
    expect(stat.total).equal(1)
    expect(stat.totalExclusive).equal(1)
  })

  it('should measure exclusive bytes ok', function () {
    const MEGABYTE = 1024 * 1024
    const stat = metrics.measureBytes('Test/Bytes', MEGABYTE * 2, MEGABYTE)
    expect(stat.total).equal(2)
    expect(stat.totalExclusive).equal(1)
  })

  it('should optionally not convert bytes to megabytes', function () {
    const MEGABYTE = 1024 * 1024
    const stat = metrics.measureBytes('Test/Bytes', MEGABYTE * 2, MEGABYTE, true)
    expect(stat.total).equal(MEGABYTE * 2)
    expect(stat.totalExclusive).equal(MEGABYTE)
  })

  describe('when serializing', function () {
    describe('unscoped metrics', function () {
      it('should get the basics right', function () {
        metrics.measureMilliseconds('Test/Metric', null, 400, 200)
        metrics.measureMilliseconds('RenameMe333', null, 400, 300)
        metrics.measureMilliseconds('Test/ScopedMetric', 'TEST', 400, 200)

        expect(JSON.stringify(metrics._toUnscopedData())).to.equal(
          '[[{"name":"Test/Metric"},[1,0.4,0.2,0.4,0.4,0.16000000000000003]],' +
            '[{"name":"RenameMe333"},[1,0.4,0.3,0.4,0.4,0.16000000000000003]]]'
        )
      })

      describe('with ordinary statistics', function () {
        const NAME = 'Agent/Test384'
        let metric
        let mapper

        beforeEach(function () {
          metric = metrics.getOrCreateMetric(NAME)
          mapper = new MetricMapper([[{ name: NAME }, 1234]])
        })

        it('should get the bare stats right', function () {
          const summary = JSON.stringify(metrics._getUnscopedData(NAME))
          expect(summary).to.equal('[{"name":"Agent/Test384"},[0,0,0,0,0,0]]')
        })

        it('should correctly map metrics to IDs given a mapping', function () {
          metrics.mapper = mapper
          const summary = JSON.stringify(metrics._getUnscopedData(NAME))
          expect(summary).equal('[1234,[0,0,0,0,0,0]]')
        })

        it('should correctly serialize statistics', function () {
          metric.recordValue(0.3, 0.1)
          const summary = JSON.stringify(metrics._getUnscopedData(NAME))
          expect(summary).to.equal('[{"name":"Agent/Test384"},[1,0.3,0.1,0.3,0.3,0.09]]')
        })
      })

      describe('with apdex statistics', function () {
        const NAME = 'Agent/Test385'
        let metric
        let mapper

        beforeEach(function () {
          metrics = new Metrics(0.8, new MetricMapper(), agent.metricNameNormalizer)
          metric = metrics.getOrCreateApdexMetric(NAME)
          mapper = new MetricMapper([[{ name: NAME }, 1234]])
        })

        it('should get the bare stats right', function () {
          const summary = JSON.stringify(metrics._getUnscopedData(NAME))
          expect(summary).to.equal('[{"name":"Agent/Test385"},[0,0,0,0.8,0.8,0]]')
        })

        it('should correctly map metrics to IDs given a mapping', function () {
          metrics.mapper = mapper
          const summary = JSON.stringify(metrics._getUnscopedData(NAME))
          expect(summary).equal('[1234,[0,0,0,0.8,0.8,0]]')
        })

        it('should correctly serialize statistics', function () {
          metric.recordValueInMillis(3220)
          const summary = JSON.stringify(metrics._getUnscopedData(NAME))
          expect(summary).to.equal('[{"name":"Agent/Test385"},[0,0,1,0.8,0.8,0]]')
        })
      })
    })

    describe('scoped metrics', function () {
      it('should get the basics right', function () {
        metrics.measureMilliseconds('Test/UnscopedMetric', null, 400, 200)
        metrics.measureMilliseconds('Test/RenameMe333', 'TEST', 400, 300)
        metrics.measureMilliseconds('Test/ScopedMetric', 'ANOTHER', 400, 200)

        expect(JSON.stringify(metrics._toScopedData())).to.equal(
          '[[{"name":"Test/RenameMe333","scope":"TEST"},' +
            '[1,0.4,0.3,0.4,0.4,0.16000000000000003]],' +
            '[{"name":"Test/ScopedMetric","scope":"ANOTHER"},' +
            '[1,0.4,0.2,0.4,0.4,0.16000000000000003]]]'
        )
      })
    })

    it('should serialize correctly', function () {
      metrics.measureMilliseconds('Test/UnscopedMetric', null, 400, 200)
      metrics.measureMilliseconds('Test/RenameMe333', null, 400, 300)
      metrics.measureMilliseconds('Test/ScopedMetric', 'TEST', 400, 200)

      expect(JSON.stringify(metrics.toJSON())).to.equal(
        '[[{"name":"Test/UnscopedMetric"},' +
          '[1,0.4,0.2,0.4,0.4,0.16000000000000003]],' +
          '[{"name":"Test/RenameMe333"},' +
          '[1,0.4,0.3,0.4,0.4,0.16000000000000003]],' +
          '[{"name":"Test/ScopedMetric","scope":"TEST"},' +
          '[1,0.4,0.2,0.4,0.4,0.16000000000000003]]]'
      )
    })
  })

  describe('when merging two metrics collections', function () {
    let other = null

    beforeEach(function () {
      metrics.started = 31337
      metrics.measureMilliseconds('Test/Metrics/Unscoped', null, 400)
      metrics.measureMilliseconds('Test/Unscoped', null, 300)
      metrics.measureMilliseconds('Test/Scoped', 'METRICS', 200)
      metrics.measureMilliseconds('Test/Scoped', 'MERGE', 100)

      other = new Metrics(agent.config.apdex_t, agent.mapper, agent.metricNameNormalizer)
      other.started = 1337
      other.measureMilliseconds('Test/Other/Unscoped', null, 800)
      other.measureMilliseconds('Test/Unscoped', null, 700)
      other.measureMilliseconds('Test/Scoped', 'OTHER', 600)
      other.measureMilliseconds('Test/Scoped', 'MERGE', 500)

      metrics.merge(other)
    })

    it('has all the metrics that were only in one', function () {
      expect(metrics.getMetric('Test/Metrics/Unscoped').callCount).equal(1)
      expect(metrics.getMetric('Test/Other/Unscoped').callCount).equal(1)
      expect(metrics.getMetric('Test/Scoped', 'METRICS').callCount).equal(1)
      expect(metrics.getMetric('Test/Scoped', 'OTHER').callCount).equal(1)
    })

    it('merged metrics that were in both', function () {
      expect(metrics.getMetric('Test/Unscoped').callCount).equal(2)
      expect(metrics.getMetric('Test/Scoped', 'MERGE').callCount).equal(2)
    })

    it('does not keep the earliest creation time', function () {
      expect(metrics.started).to.equal(31337)
    })

    it('does keep the earliest creation time if told to', function () {
      metrics.merge(other, true)
      expect(metrics.started).to.equal(1337)
    })
  })

  it('should not let exclusive duration exceed total duration')
})
