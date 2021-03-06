// @ts-check
import harden from '@agoric/harden';
import { E } from '@agoric/eventual-send';

const spawnHandler = (
  { publicFacet, http, board, invitationIssuer },
  _invitationMaker,
) =>
  harden({
    // The new CapTP public facet.
    getBootstrap(_otherSide, _meta) {
      return harden({
        getEncouragement(nickname) {
          return E(publicFacet).getFreeEncouragement(nickname);
        },
        getNotifier() {
          return E(publicFacet).getNotifier();
        },
        async sendInvitation(depositFacetId, offer, nickname) {
          const depositFacet = E(board).getValue(depositFacetId);
          const invitation = await E(publicFacet).makeInvitation(nickname);
          const invitationAmount = await E(invitationIssuer).getAmountOf(
            invitation,
          );
          const {
            value: [{ handle }],
          } = invitationAmount;
          const invitationHandleBoardId = await E(board).getId(handle);
          const updatedOffer = { ...offer, invitationHandleBoardId };
          // We need to wait for the invitation to be
          // received, or we will possibly win the race of
          // proposing the offer before the invitation is ready.
          // TODO: We should make this process more robust.
          await E(depositFacet).receive(invitation);

          return updatedOffer;
        },
      });
    },

    // The old, custom WebSocket command handler.
    // eslint-disable-next-line no-use-before-define
    getCommandHandler: makeLegacyCommandHandler({
      publicFacet,
      http,
      board,
      invitationIssuer,
    }),
  });

export default harden(spawnHandler);

// This is the old way of doing things.
const makeLegacyCommandHandler = ({
  publicFacet,
  http,
  board,
  invitationIssuer,
}) => {
  let notifier;

  // Here's how you could implement a notification-based
  // publish/subscribe.
  const subChannelHandles = new Set();

  const sendToSubscribers = obj => {
    E(http)
      .send(obj, [...subChannelHandles.keys()])
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

  return function getCommandHandler() {
    const handler = {
      onError(obj, _meta) {
        console.error('Have error', obj);
      },

      // The following is to manage the subscribers map.
      onOpen(_obj, { channelHandle }) {
        subChannelHandles.add(channelHandle);
      },
      onClose(_obj, { channelHandle }) {
        subChannelHandles.delete(channelHandle);
      },

      async onMessage(obj, { _channelHandle }) {
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

          case 'encouragement/sendInvitation': {
            const { depositFacetId, offer, nickname } = obj.data;
            const depositFacet = E(board).getValue(depositFacetId);
            const invitation = await E(publicFacet).makeInvitation(nickname);
            const invitationAmount = await E(invitationIssuer).getAmountOf(
              invitation,
            );
            const {
              value: [{ handle }],
            } = invitationAmount;
            const invitationHandleBoardId = await E(board).getId(handle);
            const updatedOffer = { ...offer, invitationHandleBoardId };
            // We need to wait for the invitation to be
            // received, or we will possibly win the race of
            // proposing the offer before the invitation is ready.
            // TODO: We should make this process more robust.
            await E(depositFacet).receive(invitation);

            return harden({
              type: 'encouragement/sendInvitationResponse',
              data: { offer: updatedOffer },
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
