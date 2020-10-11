// @ts-check
import harden from '@agoric/harden';
import { E } from '@agoric/eventual-send';

const spawnHandler = async (
  { publicFacet, http, rendezvous },
  _invitationMaker,
) => {
  const dappAddresses = await Promise.all([E(rendezvous).getLocalAddress()]);
  return harden({
    // The new CapTP public facet.
    async getBootstrap(otherSide, _meta) {
      return harden({
        getEncouragement(nickname) {
          return E(publicFacet).getFreeEncouragement(nickname);
        },
        getNotifier() {
          return E(publicFacet).getNotifier();
        },
        async getDappAddresses() {
          return dappAddresses;
        },
        async rendezvousWith(walletAddresses) {
          const entries = walletAddresses.map(addr => [addr, otherSide]);
          return E(rendezvous).rendezvousWith(Object.fromEntries(entries));
        },
        async makeInvitatition(nickname) {
          return E(publicFacet).makeInvitation(nickname);
        },
      });
    },

    // The old, custom WebSocket command handler.
    // eslint-disable-next-line no-use-before-define
    getCommandHandler: makeLegacyCommandHandler({
      publicFacet,
      http,
      rendezvous,
      dappAddresses,
    }),
  });
};

export default harden(spawnHandler);

// This is the old way of doing things.
const makeLegacyCommandHandler = ({
  publicFacet,
  http,
  rendezvous,
  dappAddresses,
}) => {
  let notifier;

  // Here's how you could implement a notification-based
  // publish/subscribe.
  const subChannelWallets = new Map();

  const sendToSubscribers = obj => {
    E(http)
      .send(obj, [...subChannelWallets.keys()])
      .catch(e => console.error('cannot send', e));
  };

  const fail = e => {
    const obj = {
      type: 'encouragement/encouragedError',
      data: (e && e.message) || e,
    };
    sendToSubscribers(obj);
  };

  const doOneNotification = updateResponse => {
    // Publish to our subscribers.
    const obj = {
      type: 'encouragement/encouragedResponse',
      data: updateResponse.value,
    };
    sendToSubscribers(obj);

    // Wait until the next notification resolves.
    E(notifier)
      .getUpdateSince(updateResponse.updateCount)
      .then(doOneNotification, fail);
  };

  notifier = E(publicFacet).getNotifier();
  E(notifier)
    .getUpdateSince()
    .then(doOneNotification, fail);

  return () => {
    const handler = {
      onError(obj, _meta) {
        console.error('Have error', obj);
      },

      // The following is to manage the subscribers map.
      onOpen(_obj, { channelHandle }) {
        subChannelWallets.set(channelHandle, {});
        E(http).send(
          {
            type: 'encouragement/dappAddresses',
            data: dappAddresses,
          },
          [channelHandle],
        );
      },
      onClose(_obj, { channelHandle }) {
        subChannelWallets.delete(channelHandle);
      },

      async onMessage(obj, { channelHandle }) {
        // These are messages we receive from either POST or WebSocket.
        switch (obj.type) {
          case 'encouragement/getEncouragement': {
            return harden({
              type: 'encouragement/getEncouragementResponse',
              data: await E(publicFacet).getFreeEncouragement(
                obj.data && obj.data.nickname,
              ),
            });
          }

          case 'encouragement/subscribeNotifications': {
            return harden({
              type: 'encouragement/subscribeNotificationsResponse',
              data: true,
            });
          }

          case 'encouragement/rendezvousWith': {
            const { walletAddresses } = obj.data;
            const entries = walletAddresses.map(addr => [addr, null]);
            const addrWallets = await E(rendezvous).rendezvousWith(
              Object.fromEntries(entries),
            );
            subChannelWallets.set(channelHandle, addrWallets);
            return harden({
              type: 'encouragement/rendezvousWithResponse',
              data: { matchedWallets: Object.keys(addrWallets) },
            });
          }

          case 'encouragement/addOfferInvitation': {
            const { offer, nickname, walletAddress } = obj.data;

            const wallet = subChannelWallets.get(channelHandle)[walletAddress];
            if (!wallet) {
              throw Error(`No such wallet address ${walletAddress}`);
            }

            const invitation = E(publicFacet).makeInvitation(nickname);
            await E(wallet).addOfferInvitation(offer, invitation);
            return harden({
              type: 'encouragement/addOfferInvitationResponse',
              data: true,
            });
          }

          default:
            return undefined;
        }
      },
    };
    return harden(handler);
  };
};
