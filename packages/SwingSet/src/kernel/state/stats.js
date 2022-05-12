// @ts-check

/** @typedef {'counter' | 'gauge'} KernelStatsMetricType */
/**
 * @template {KernelStatsMetricType} [T=KernelStatsMetricType]
 * @template {string} [K=string]
 * @typedef {object} KernelStatsMetric
 * @property {K} key
 * @property {string} name
 * @property {boolean | undefined} [consensus]
 * @property {string} description
 * @property {T} metricType
 */

/**
 * @template {KernelStatsMetric} [T=KernelStatsMetric]
 * @param {ReadonlyArray<T>} kernelStatsMetrics
 */
export const makeKernelStats = kernelStatsMetrics => {
  /** @typedef {T extends KernelStatsMetric<'gauge', infer K> ? K : never} GaugeKeys */
  /** @typedef {T extends KernelStatsMetric<'counter', infer K> ? K : never} CounterKeys */
  /** @typedef {(GaugeKeys | CounterKeys) extends never ? string : (GaugeKeys | CounterKeys) } IncStatKeys */
  /** @typedef {(GaugeKeys | CounterKeys) extends never ? string : GaugeKeys } DecStatKeys */

  // These are the defined kernel statistics counters.
  //
  // For any counter 'foo' that is defined here, if there is also a defined
  // counter named 'fooMax', the stats collection machinery will automatically
  // track the latter as a high-water mark for 'foo'.
  //
  // For any counter 'foo' that is defined here, if there is also a defined
  // counter named 'fooUp', the stats collection machinery will automatically
  // track the number of times 'foo' is incremented.  Similarly, 'fooDown' will
  // track the number of times 'foo' is decremented.
  /** @type {Record<string, number> | null} */
  let kernelLocalStats = null;

  /** @type {Record<string, number> | null} */
  let kernelConsensusStats = null;

  /** @type {Record<string, number>} */
  const defaultConsensusStats = {};
  /** @type {Record<string, number>} */
  const defaultLocalStats = {};

  for (const { key, consensus, metricType } of kernelStatsMetrics) {
    const targetStats = consensus ? defaultConsensusStats : defaultLocalStats;

    switch (metricType) {
      case 'counter': {
        targetStats[key] = 0;
        break;
      }
      case 'gauge': {
        targetStats[key] = 0;
        targetStats[`${key}Up`] = 0;
        targetStats[`${key}Down`] = 0;
        targetStats[`${key}Max`] = 0;
        break;
      }
      default:
        assert.fail(`Unknown stat type ${metricType}`);
    }
  }

  Object.freeze(defaultConsensusStats);
  Object.freeze(defaultLocalStats);

  const pickStats = stat => {
    assert(
      kernelConsensusStats && kernelLocalStats,
      'Kernel stats not initialized',
    );
    return stat in kernelConsensusStats
      ? kernelConsensusStats
      : kernelLocalStats;
  };

  /**
   * @param {IncStatKeys} stat
   * @param {number} [delta]
   */
  const incStat = (stat, delta = 1) => {
    const kernelStats = pickStats(stat);
    assert.typeof(kernelStats[stat], 'number');
    kernelStats[stat] += delta;
    const maxStat = `${stat}Max`;
    if (
      kernelStats[maxStat] !== undefined &&
      kernelStats[stat] > kernelStats[maxStat]
    ) {
      kernelStats[maxStat] = kernelStats[stat];
    }
    const upStat = `${stat}Up`;
    if (kernelStats[upStat] !== undefined) {
      kernelStats[upStat] += delta;
    }
  };

  /**
   * @param {DecStatKeys} stat
   * @param {number} [delta]
   */
  const decStat = (stat, delta = 1) => {
    const kernelStats = pickStats(stat);
    const downStat = `${stat}Down`;
    assert.typeof(kernelStats[stat], 'number');
    assert.typeof(kernelStats[downStat], 'number');
    kernelStats[stat] -= delta;
    kernelStats[downStat] += delta;
  };

  /** @param {boolean | undefined} [consensusOnly] */
  const getStats = consensusOnly => {
    return {
      ...(consensusOnly ? {} : kernelLocalStats),
      ...kernelConsensusStats,
    };
  };

  const initializeStats = () => {
    kernelConsensusStats = { ...defaultConsensusStats };
    kernelLocalStats = { ...defaultLocalStats };
  };

  const getSerializedStats = () => {
    assert(
      kernelConsensusStats && kernelLocalStats,
      'Kernel stats not initialized',
    );

    return {
      consensusStats: JSON.stringify(kernelConsensusStats),
      localStats: JSON.stringify(kernelLocalStats),
    };
  };

  /**
   * @param {object} serializedStats
   * @param {string} serializedStats.consensusStats
   * @param {string | undefined} [serializedStats.localStats]
   */
  const loadFromSerializedStats = ({ consensusStats, localStats }) => {
    kernelConsensusStats = {
      ...defaultConsensusStats,
      ...JSON.parse(consensusStats),
    };
    kernelLocalStats = {
      ...defaultLocalStats,
      ...JSON.parse(localStats || '{}'),
    };
  };

  return {
    incStat,
    decStat,
    getStats,
    initializeStats,
    loadFromSerializedStats,
    getSerializedStats,
  };
};
