// @ts-check

import { E } from '@agoric/eventual-send';
import { showPurseBalance, setupPurses } from './helpers';
import { makePrintLog } from './printLog';

import '@agoric/zoe/exported';

const log = makePrintLog();

/**
 * @param {string} name
 * @param {ZoeService} zoe
 * @param {Issuer[]} issuers
 * @param {Payment[]} payments
 * @param {{ makeInvitation: () => Invitation }} publicAPI
 */
async function build(name, zoe, issuers, payments, publicAPI) {
  const { moola, simoleans, purses } = await setupPurses(
    zoe,
    issuers,
    payments,
  );
  const [moolaPurseP, simoleanPurseP] = purses;

  const invitationIssuer = await E(zoe).getInvitationIssuer();

  async function preReport() {
    await showPurseBalance(moolaPurseP, `${name} moola before`, log);
    await showPurseBalance(simoleanPurseP, `${name} simoleans before`, log);
  }

  async function postReport() {
    await showPurseBalance(moolaPurseP, `${name} moola after`, log);
    await showPurseBalance(simoleanPurseP, `${name} simoleans after`, log);
  }

  async function receivePayout(payoutP) {
    const payout = await payoutP;
    const moolaPayout = await payout.Asset;
    const simoleanPayout = await payout.Price;

    await E(moolaPurseP).deposit(moolaPayout);
    await E(simoleanPurseP).deposit(simoleanPayout);
  }

  async function initiateTrade(otherP) {
    await preReport();

    const addOrderInvitation = await E(publicAPI).makeInvitation();

    const mySellOrderProposal = harden({
      give: { Asset: moola(1) },
      want: { Price: simoleans(1) },
      exit: { onDemand: null },
    });
    const paymentKeywordRecord = {
      Asset: await E(moolaPurseP).withdraw(moola(1)),
    };
    const seat = await E(zoe).offer(
      addOrderInvitation,
      mySellOrderProposal,
      paymentKeywordRecord,
    );
    const payoutP = E(seat).getPayouts();

    const invitationP = E(publicAPI).makeInvitation();
    await E(otherP).respondToTrade(invitationP);

    await receivePayout(payoutP);
    await postReport();
  }

  async function respondToTrade(invitationP) {
    await preReport();

    const invitation = await invitationP;
    const exclInvitation = await E(invitationIssuer).claim(invitation);

    const myBuyOrderProposal = harden({
      want: { Asset: moola(1) },
      give: { Price: simoleans(1) },
      exit: { onDemand: null },
    });
    const paymentKeywordRecord = {
      Price: await E(simoleanPurseP).withdraw(simoleans(1)),
    };

    const seatP = await E(zoe).offer(
      exclInvitation,
      myBuyOrderProposal,
      paymentKeywordRecord,
    );
    const payoutP = E(seatP).getPayouts();

    await receivePayout(payoutP);
    await postReport();
  }

  return harden({
    initiateTrade,
    respondToTrade,
  });
}

export function buildRootObject(_vatPowers, vatParameters) {
  return harden({
    build: (zoe, issuers, payments, publicAPI) =>
      build(vatParameters.name, zoe, issuers, payments, publicAPI),
  });
}
