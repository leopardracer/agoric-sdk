/** @file core-eval that includes changes necessary to support FastUSDC to EVM destinations */

import { makeTracer } from '@agoric/internal';
import { E, Far } from '@endo/far';
import cctpChainInfo from '@agoric/orchestration/src/cctp-chain-info.js';
import { AmountMath } from '@agoric/ertp';
import { DestinationOverridesShape } from '@agoric/fast-usdc/src/type-guards.js';
import {
  fromExternalConfig,
  toExternalConfig,
} from './utils/config-marshal.js';

const trace = makeTracer('FUSD-EVM', true);
const { make } = AmountMath;

/**
 * @import {CopyRecord} from '@endo/pass-style';
 * @import {ManifestBundleRef} from '@agoric/deploy-script-support/src/externalTypes.js';
 * @import {CosmosChainInfo, IBCConnectionInfo} from '@agoric/orchestration';
 * @import {BundleID} from '@agoric/swingset-vat';
 * @import {BootstrapManifest} from '@agoric/vats/src/core/lib-boot.js';
 * @import {FastUSDCCorePowers} from './start-fast-usdc.core.js';
 * @import {LegibleCapData} from './utils/config-marshal.js'
 * @import {FeeConfig} from '@agoric/fast-usdc';
 */

const { keys } = Object;

export const externalConfigContext = /** @type {const} */ ({
  /** @type {Brand<'nat'>} */
  USDC: Far('USDC Brand'),
});

/**
 * @param {bigint} value
 * @returns {Amount<'nat'>}
 */
const USDC = value => make(externalConfigContext.USDC, value);

export const config = /** @type {const} */ ({
  MAINNET: {
    agoricToNoble: {
      id: 'connection-72',
      client_id: '07-tendermint-77',
      counterparty: {
        client_id: '07-tendermint-32',
        connection_id: 'connection-38',
      },
      state: 3,
      transferChannel: {
        channelId: 'channel-62',
        portId: 'transfer',
        counterPartyChannelId: 'channel-21',
        counterPartyPortId: 'transfer',
        ordering: 0,
        state: 3,
        version: 'ics20-1',
      },
    },
    legibleDestinationOverrides: toExternalConfig(
      harden(
        /** @type {FeeConfig['destinationOverrides']} */ ({
          'eip155:1': { relay: USDC(500_000n) }, // ethereum L1
          'eip155:43114': { relay: USDC(10_000n) }, // avalanche
          'eip155:10': { relay: USDC(10_000n) }, // optimism
          'eip155:42161': { relay: USDC(10_000n) }, // arbitrum
          'eip155:8453': { relay: USDC(10_000n) }, // base
          'eip155:137': { relay: USDC(10_000n) }, // polygon
        }),
      ),
      externalConfigContext,
      DestinationOverridesShape,
    ),
  },
});
harden(config);

assert(
  Object.values(cctpChainInfo)
    .filter(c => c.namespace === 'eip155')
    .every(
      ci =>
        `${ci.namespace}:${ci.reference}` in
        // @ts-expect-error Type instantiation is excessively deep and possibly infinite.ts(2589)
        config.MAINNET.legibleDestinationOverrides.structure,
    ),
  'all "eip155" chains captured in destinationRelayOverrides',
);

/**
 * @typedef {object} UpdateOpts
 * @property {IBCConnectionInfo} [agoricToNoble]
 * @property {{bundleID: BundleID}} [fastUsdcCode]
 * @property {LegibleCapData<FeeConfig['destinationOverrides']>} [legibleDestinationOverrides]
 */

/**
 * @param {BootstrapPowers & FastUSDCCorePowers} powers
 * @param {object} [config]
 * @param {UpdateOpts} [config.options]
 */
export const upgradeEvmDests = async (
  { consume: { fastUsdcKit } },
  { options = {} } = {},
) => {
  trace('options', options);
  const {
    agoricToNoble = config.MAINNET.agoricToNoble,
    legibleDestinationOverrides = config.MAINNET.legibleDestinationOverrides,
    fastUsdcCode = assert.fail('missing bundleID'),
  } = options;
  const fuKit = await fastUsdcKit;
  trace('fastUsdcKit.privateArgs keys:', keys(fuKit.privateArgs));
  const { brand: usdcBrand } = fuKit.privateArgs.feeConfig.flat;
  const { adminFacet, creatorFacet } = fuKit;

  const destinationOverrides = fromExternalConfig(
    legibleDestinationOverrides,
    { USDC: usdcBrand },
    DestinationOverridesShape,
  );

  const upgraded = await E(adminFacet).upgradeContract(fastUsdcCode.bundleID, {
    ...fuKit.privateArgs,
    feeConfig: {
      ...fuKit.privateArgs.feeConfig,
      destinationOverrides,
    },
  });
  trace('fastUsdc upgraded', upgraded);

  /**
   * update existing registered chains to include CAIP-2 `namespace` and `reference`
   */
  for (const [chainName, info] of Object.entries(fuKit.privateArgs.chainInfo)) {
    // note: connections in privateArgs is stale, but we're not using them here
    const { connections: _, ...chainInfo } =
      /** @type {Omit<CosmosChainInfo, 'reference' | 'namespace'>} */ (info);
    await E(creatorFacet).updateChain(chainName, {
      ...chainInfo,
      namespace: 'cosmos',
      reference: chainInfo.chainId,
      // does not affect runtime logic, but best to include for consistency
      ...(chainName === 'noble' && {
        cctpDestinationDomain: cctpChainInfo.noble.cctpDestinationDomain,
      }),
    });
  }
  // XXX consider updating fuKit with new privateArgs.chainInfo
  trace('chainHub repaired');

  /**
   * register new destination chains reachable via CCTP
   */
  for (const [chainName, info] of Object.entries(cctpChainInfo)) {
    if (info.namespace !== 'eip155') continue; // exclude solana, noble
    await E(creatorFacet).registerChain(chainName, {
      ...info,
      // for backwards compatibility with `CosmosChainInfoShapeV1` which expects a `chainId`
      // @ts-expect-error no longer expected
      chainId: `${info.namespace}:${info.reference}`,
    });
  }

  const { agoric, noble } = fuKit.privateArgs.chainInfo;
  /**
   * It's necessary to supply parameters, as `lookupChainsAndConnection` now performs
   * a namespace === 'cosmos' check. In the initial upgrade, connectionInfo will be undefined
   * as a result. After calling `chainHub.updateChain()`, subsequent calls should resolve.
   *
   * Our contract relies on `agToNoble` when creating the `Settler`, but since `zone.makeOnce()`
   * is used it's OK for this to be undefined until a future incarnation.
   */
  await E(creatorFacet).connectToNoble(
    agoric.chainId,
    noble.chainId,
    agoricToNoble,
  );

  // Just once to fix https://github.com/Agoric/agoric-private/issues/312
  await E(creatorFacet).remediateUndetectedBatches(10_000_000n); // $10 min

  trace('upgradeEvmDests done');
};

/**
 * @param {unknown} _utils
 * @param {{
 *   installKeys: { fastUsdc: ERef<ManifestBundleRef> };
 *   options: Omit<UpdateOpts, 'fastUsdcCode'> & CopyRecord;
 * }} opts
 */
export const getManifestForUpgradeEvmDests = (
  _utils,
  { installKeys, options },
) => {
  return {
    /** @type {BootstrapManifest} */
    manifest: {
      [upgradeEvmDests.name]: {
        consume: { fastUsdcKit: true },
      },
    },
    options: { ...options, fastUsdcCode: installKeys.fastUsdc },
  };
};
