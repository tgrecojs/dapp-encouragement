// @ts-check
import '@agoric/zoe/exported';
import harden from '@agoric/harden';
import makeIssuerKit from '@agoric/ertp';
import { makeNotifierKit } from '@agoric/notifier';

/**
 * This contract provides encouragement. For a small donation it provides more.
 *
 * @param {ContractFacet} zcf
 * 
 */
const start = async (zcf, terms) => {
  // FIXME REMOVE
  console.log("TERMS ", terms);

  let count = 0;
  const messages = {
    basic: `You're doing great!`,
    premium: `Wow, just wow. I have never seen such talent!`,
  };
  const { notifier, updater } = makeNotifierKit(undefined);

  const assuranceMint = await zcf.makeZCFMint('Assurance','set');
  // Now ZCF has saved the issuer, brand, and local amountMath so that they
  // can be accessed synchronously.
  const { amountMath: assuranceMath, issuer } = assuranceMint.getIssuerRecord();

  const { brandKeywordRecord: { Tip: tipBrand } } = zcf.getInstanceRecord();
  const tipAmountMath = zcf.getAmountMath(tipBrand);

  /** @type {ZCFSeat} */
  let adminSeat;

  const updateNotification = () => {
    updater.updateState({ messages, count });
  };
  updateNotification();

  /**
   * @param {ZCFSeat} seat
   */
  const adminHook = seat => {
    adminSeat = seat;
    return `admin invite redeemed`;
  };

  /**
   * @param {ZCFSeat} seat
   */
  const encourage = seat => {
    // if the adminOffer is no longer active (i.e. the admin cancelled
    // their offer and retrieved their tips), we just don't give any
    // encouragement.
    // TODO should this just be checking whether the *contract* has exited?
    if (adminSeat.hasExited()) {
      seat.kickOut(`We are no longer giving encouragement`);
    }

    let encouragement = messages.basic;

    const tipAmount = seat.getAmountAllocated('Tip', tipBrand);
    if (tipAmountMath.isGTE(tipAmount, tipAmountMath.make(1))) {
      // if the user gives a tip, we provide a premium encouragement message
      encouragement = messages.premium;
      
      // Create a non-fungible serial number for the admin to trade
      const assuranceAmount = assuranceMath.make([count + 1]);
      assuranceMint.mintGains({ Assurance: assuranceAmount }, adminSeat);

      const userStage = seat.stage({
        Tip: tipAmountMath.getEmpty(),
        Assurance: assuranceAmount,
      });

      // reallocate the tip to the adminOffer
      const adminTips = adminSeat.getAmountAllocated('Tip', tipBrand);
      const adminStage = adminSeat.stage({
        Tip: tipAmountMath.add(adminTips, tipAmount),
        Assurance: assuranceMath.getEmpty(),
      });

      zcf.reallocate(adminStage, userStage);
    }
    seat.exit();
    count += 1;
    updateNotification();
    return encouragement;
  };

  const publicFacet = {
    makeInvite() {
      return zcf.makeInvitation(encourage, 'encouragement');
    },
    getFreeEncouragement() {
      count += 1;
      updateNotification();
      return messages.basic;
    },
    getAssuranceIssuer() {
      return issuer;
    },
    getNotifier() {
      return notifier;
    },
  };

  const creatorInvitation = zcf.makeInvitation(adminHook, 'admin');
  return harden({ creatorInvitation, publicFacet });
};

harden(start);
export { start };
