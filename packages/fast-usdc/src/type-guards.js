import { AmountShape, BrandShape, RatioShape } from '@agoric/ertp';
import { M } from '@endo/patterns';
import {
  DenomDetailShape,
  DenomShape,
} from '@agoric/orchestration/src/typeGuards.js';
import { PendingTxStatus } from './constants.js';

/**
 * @import {Amount, Brand, NatValue, Payment} from '@agoric/ertp';
 * @import {TypedPattern} from '@agoric/internal';
 * @import {CosmosChainInfo, Denom, DenomDetail, OrchestrationAccount, IBCConnectionInfo, CaipChainId} from '@agoric/orchestration';
 * @import {USDCProposalShapes} from './pool-share-math.js';
 * @import {CctpTxEvidence, FastUSDCConfig, FastUsdcTerms, FeeConfig, PendingTx, PoolMetrics, ChainPolicy, FeedPolicy, AddressHook, EvmAddress, EvmHash, RiskAssessment, EvidenceWithRisk} from './types.js';
 */

/**
 * @param {Brand<'nat'>} brand must be a 'nat' brand, not checked
 * @param {NatValue} [min]
 */
export const makeNatAmountShape = (brand, min) =>
  harden({ brand, value: min ? M.gte(min) : M.nat() });

/** @param {Record<'PoolShares' | 'USDC', Brand<'nat'>>} brands */
export const makeProposalShapes = ({ PoolShares, USDC }) => {
  /** @type {TypedPattern<USDCProposalShapes['deposit']>} */
  const deposit = M.splitRecord({
    give: { USDC: makeNatAmountShape(USDC, 1n) },
    want: { PoolShare: makeNatAmountShape(PoolShares) },
  });
  /** @type {TypedPattern<USDCProposalShapes['withdraw']>} */
  const withdraw = M.splitRecord({
    give: { PoolShare: makeNatAmountShape(PoolShares, 1n) },
    want: { USDC: makeNatAmountShape(USDC, 1n) },
  });
  /** @type {TypedPattern<USDCProposalShapes['withdrawFees']>} */
  const withdrawFees = M.splitRecord({
    want: { USDC: makeNatAmountShape(USDC, 1n) },
  });
  return harden({ deposit, withdraw, withdrawFees });
};

/** @type {TypedPattern<FastUsdcTerms>} */
export const FastUSDCTermsShape = harden({
  usdcDenom: M.string(),
});

/** @type {TypedPattern<EvmAddress>} */
export const EvmAddressShape = M.string({
  // 0x + 40 hex digits
  stringLengthLimit: 42,
});
harden(EvmAddressShape);

/** @type {TypedPattern<EvmHash>} */
export const EvmHashShape = M.string({
  stringLengthLimit: 66,
});
harden(EvmHashShape);

/** @type {TypedPattern<RiskAssessment>} */
export const RiskAssessmentShape = M.splitRecord(
  {},
  {
    risksIdentified: M.arrayOf(M.string()),
  },
);
harden(RiskAssessmentShape);

/** @type {TypedPattern<CctpTxEvidence>} */
export const CctpTxEvidenceShape = {
  aux: {
    forwardingChannel: M.string(),
    recipientAddress: M.string(),
  },
  blockHash: EvmHashShape,
  blockNumber: M.nat(),
  blockTimestamp: M.nat(),
  chainId: M.number(),
  tx: {
    amount: M.nat(),
    forwardingAddress: M.string(),
    sender: EvmAddressShape,
  },
  txHash: EvmHashShape,
};
harden(CctpTxEvidenceShape);

/** @type {TypedPattern<EvidenceWithRisk>} */
export const EvidenceWithRiskShape = {
  evidence: CctpTxEvidenceShape,
  risk: RiskAssessmentShape,
};
harden(EvidenceWithRiskShape);

/** @type {TypedPattern<PendingTx>} */
// @ts-expect-error TypedPattern not recognized as record
export const PendingTxShape = {
  ...CctpTxEvidenceShape,
  status: M.or(...Object.values(PendingTxStatus)),
};
harden(PendingTxShape);

/** @type {TypedPattern<AddressHook>} */
export const AddressHookShape = {
  baseAddress: M.string(),
  query: { EUD: M.string() },
};
harden(AddressHookShape);

const NatAmountShape = { brand: BrandShape, value: M.nat() };

/** @type {TypedPattern<FeeConfig['destinationOverrides']>} */
export const DestinationOverridesShape = M.recordOf(
  M.string(),
  M.splitRecord(
    {},
    {
      flat: NatAmountShape,
      variableRate: RatioShape,
      contractRate: RatioShape,
      relay: NatAmountShape,
    },
  ),
);

/** @type {TypedPattern<FeeConfig>} */
export const FeeConfigShape = M.splitRecord(
  {
    flat: NatAmountShape,
    variableRate: RatioShape,
    contractRate: RatioShape,
  },
  {
    relay: NatAmountShape,
    destinationOverrides: DestinationOverridesShape,
  },
  {},
);

/** @type {TypedPattern<PoolMetrics>} */
export const PoolMetricsShape = {
  encumberedBalance: AmountShape,
  shareWorth: RatioShape,
  totalContractFees: AmountShape,
  totalPoolFees: AmountShape,
  totalBorrows: AmountShape,
  totalRepays: AmountShape,
};
harden(PoolMetricsShape);

/** @type {TypedPattern<ChainPolicy>} */
export const ChainPolicyShape = {
  attenuatedCttpBridgeAddresses: M.splitArray(
    [EvmHashShape],
    undefined,
    M.arrayOf(EvmHashShape),
  ),
  cctpTokenMessengerAddress: EvmHashShape,
  confirmations: M.number(),
  chainId: M.number(),
  rateLimits: {
    tx: M.bigint(),
    blockWindow: M.bigint(),
    blockWindowSize: M.number(),
  },
};
harden(ChainPolicyShape);

/**
 * @type {TypedPattern<FeedPolicy>}
 *
 * must be CopyData; no Brands or other Remotables
 */
export const FeedPolicyShape = M.splitRecord(
  {
    nobleDomainId: M.number(),
    nobleAgoricChannelId: M.string(),
    chainPolicies: M.recordOf(M.string(), ChainPolicyShape),
  },
  { eventFilter: M.string() },
);
harden(FeedPolicyShape);

/**
 * The version of CosmosChainInfoShape that matches the `valueShape` used in FUSDC's ChainHub's `chainInfos` mapStore.
 * @type {TypedPattern<CosmosChainInfo>}
 */
export const CosmosChainInfoShapeV1 = M.splitRecord(
  {
    chainId: M.string(),
  },
  {
    bech32Prefix: M.string(),
    connections: M.record(),
    stakingTokens: M.arrayOf({ denom: M.string() }),
    // UNTIL https://github.com/Agoric/agoric-sdk/issues/9326
    icqEnabled: M.boolean(),
    pfmEnabled: M.boolean(),
  },
);

/** @type {TypedPattern<FastUSDCConfig>} */
export const FastUSDCConfigShape = M.splitRecord({
  terms: FastUSDCTermsShape,
  oracles: M.recordOf(M.string(), M.string()),
  feeConfig: FeeConfigShape,
  feedPolicy: FeedPolicyShape,
  chainInfo: M.recordOf(M.string(), CosmosChainInfoShapeV1),
  assetInfo: M.arrayOf([DenomShape, DenomDetailShape]),
});
