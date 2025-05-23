# Fast USDC

Contracts for the Fast USDC product. Here in agoric-sdk as a convenience for
integration testing and iterating on the SDK affordances required for the product.

# Transaction feed

## Oracles interface

Oracles run off-chain and interact with the contract via an Agoric smart wallet bridge.
```mermaid
sequenceDiagram
    title Becoming an oracle operator
    participant OW as Operator N<br/>Smart Wallet
    participant FUC as Fast USDC<br/>Contract Exo
    participant CE as Core Eval

    CE->>FUC: makeOperatorInvitation()
    FUC-->>CE: operatorInvitation
    CE->>+OW: deposit(operatorInvitation)

    Note left of FUC: Off-chain wallet accepts the operator invitation

    OW->>+FUC: offer(operatorInvitation)
    FUC-->>OW: operator invitationMakers: {SubmitEvidence}

    Note left of FUC: Off-chain watcher detects evidence
    OW->>+FUC: offer(SubmitEvidence, evidence)
```

```mermaid
sequenceDiagram
    title Receiving evidence
    participant W as Operator N<br/>Smart Wallet
    participant A as Operator N<br/>Admin Oexo
    participant TF as Transaction<br/>Feed

    W->>A: offer(SubmitEvidence, evidence)

    Note left of A: Once 3 operators push the same…

    A->>TF: notify(evidence)
```

# Status Manager

### State Diagram

*Transactions are qualified by the OCW and TransactionFeed before being
delivered to the Advancer.*

The transactionFeed receives attestations from Oracles, records their
evidence, and when enough oracles agree, (if no risks are identified)
it publishes the results for the advancer to act on.

The Advancer subscribes (via `handleTransactionEvent`) to events published by
the transactionFeed. When notified of an appropriate opportunity, it is
responsible for advancing funds to fastUSDC payees.

The Settler is responsible for monitoring (via `receiveUpcall`) deposits to the
settlementAccount. It either `disburse`s funds to the Pool (if funds were
`advance`d to the payee), or `forwards` funds to the payee (if pool funds
were not `advance`d).

For `namespace:cosmos` destinations, the `Advanced` state signifies an IBC
Acknowledgement has been received from the destination chain and the end user
has received their funds. For non-Cosmos destinations that leverage CCTP
through Noble, `Advanced` signifies `MsgDepositForBurn` was accepted by the
Noble chain. There is additional latency until the user gets their funds -
namely, `MsgReceive` must be submitted on the destination chain. The contract
is unable to track that flow so `Advanced` represents a best effort in these
cases. For the `Forwarded` state, the same distinction applies.

With respect to timing, reaching the `Advanced` or `Forwarded` states for
non-Cosmos destinations is expected to take longer than Cosmos destinations
since there are two IBC packet lifecycles that need to take place - one for the
IBC Transfer to the Noble ICA and one for `MsgDepositForBurn`.

Minting deposits can sometimes arrive before the oracles provide an observation of the transaction. `mintedEarly` is used by both **Advancer** and **Settler** to handle token deposits that arrive before there is enough evidence to determine whether to advance or skip, or that arrive while an advance is already in progress.

- **Pre-Evidence Deposits**: Tokens can be minted into the settlement account (via `receiveUpcall`) before we have the oracle evidence. These funds are tracked in `mintedEarly` until evidence is received, at which point the system will `Forward`.
- **Mid-Advance Deposits**: If additional tokens arrive while the Advancer is still waiting for an IBC transfer to settle (`Advancing`), those funds also go into `mintedEarly`. Once the transfer completes — when an IBC acknowledgment or timeout is received from the destination chain — the corresponding `mintedEarly` entry is cleared, and the settlement is either disbursed or forwarded. Disbursement occurs if the advance is successful, while a forward (no fees) retries the transfer.


```mermaid
stateDiagram-v2
  state Forwarding <<choice>>
  state AdvancingChoice <<choice>>

  Observed --> AdvanceSkipped : Risks identified
  Observed --> Advancing : No risks, can advance
  Observed --> Forwarding : No risks, Mint deposited before advance

  Forwarding --> Forwarded : settler.forward() succeeds
  Forwarding --> ForwardSkipped : settler.forward() skipped
  Advancing --> AdvancingChoice
  AdvancingChoice --> Advanced : advancer's transferHandler detects success
  Advanced --> Disbursed : settler.disburse()
  AdvanceSkipped --> Forwarding : Mint deposited
  AdvanceFailed --> Forwarding : Mint deposited
  AdvancingChoice --> AdvanceFailed : advancer's transferHandler detects failure
  Forwarding --> ForwardFailed : settler.forward() fails
  ForwardFailed --> Forwarding : retry when any transfer to destination chain succeeds

  # Terminal states
  Disbursed --> [*]
  Forwarded --> [*]
  ForwardSkipped --> [*]
```
