import { M } from '@endo/patterns';
import { E } from '@endo/far';
import { makeTracer } from '@agoric/internal';
import { prepareChainHubAdmin } from '../exos/chain-hub-admin.js';
import { withOrchestration } from '../utils/start-helper.js';
import { registerChainsAndAssets } from '../utils/chain-hub-helper.js';
import * as evmFlows from './axelar-gmp.flows.js';
import { prepareEvmAccountKit } from './axelar-gmp-account-kit.js';

/**
 * @import {Remote, Vow} from '@agoric/vow';
 * @import {Zone} from '@agoric/zone';
 * @import {OrchestrationPowers, OrchestrationTools} from '../utils/start-helper.js';
 * @import {CosmosChainInfo, Denom, DenomDetail} from '@agoric/orchestration';
 * @import {Marshaller, StorageNode} from '@agoric/internal/src/lib-chainStorage.js';
 * @import {ZCF} from '@agoric/zoe';
 */

const trace = makeTracer('AxelarGmp');

/**
 * Orchestration contract to be wrapped by withOrchestration for Zoe
 *
 * @param {ZCF} zcf
 * @param {OrchestrationPowers & {
 *   marshaller: Marshaller;
 *   chainInfo?: Record<string, CosmosChainInfo>;
 *   assetInfo?: [Denom, DenomDetail & { brandKey?: string }][];
 *   storageNode: Remote<StorageNode>;
 * }} privateArgs
 * @param {Zone} zone
 * @param {OrchestrationTools} tools
 */
export const contract = async (
  zcf,
  privateArgs,
  zone,
  { chainHub, orchestrateAll, vowTools, zoeTools },
) => {
  trace('Inside Contract');

  registerChainsAndAssets(
    chainHub,
    zcf.getTerms().brands,
    privateArgs.chainInfo,
    privateArgs.assetInfo,
  );

  const creatorFacet = prepareChainHubAdmin(zone, chainHub);

  // UNTIL https://github.com/Agoric/agoric-sdk/issues/9066
  const logNode = E(privateArgs.storageNode).makeChildNode('log');
  /** @type {(msg: string) => Vow<void>} */
  const log = msg => vowTools.watch(E(logNode).setValue(msg));

  const makeEvmAccountKit = prepareEvmAccountKit(zone.subZone('evmTap'), {
    zcf,
    vowTools,
    log,
    zoeTools,
  });

  const { localTransfer, withdrawToSeat } = zoeTools;
  const { createAndMonitorLCA } = orchestrateAll(evmFlows, {
    makeEvmAccountKit,
    log,
    chainHub,
    localTransfer,
    withdrawToSeat,
  });

  const publicFacet = zone.exo(
    'Send PF',
    M.interface('Send PF', {
      createAndMonitorLCA: M.callWhen().returns(M.any()),
    }),
    {
      createAndMonitorLCA() {
        return zcf.makeInvitation(
          createAndMonitorLCA,
          'makeAccount',
          undefined,
        );
      },
    },
  );

  return { publicFacet, creatorFacet };
};
harden(contract);

export const start = withOrchestration(contract);
harden(start);
