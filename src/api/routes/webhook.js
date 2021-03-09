/* eslint-disable no-magic-numbers */
/* eslint-disable max-len */
/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
const { Router } = require('express');
const { addPackage, changePackageName } = require('../../services/packages.service');
const { Package } = require('../../model/package');
const router = Router();

const TWO_WORDS = 2;
const THREE_WORDS = 3;
const FOUR_WORDS = 4;
const PACKAGE_LENGTH = 3;
const BAD_PACKAGE_NUMBER_LENGTH = 4;
const TWO_ELEMENTS = 2;

let tokens = [];
const sessions = {};

function contains(array, find) {
  let count = 0;
  for (const where of array) {
    for (const what of find) {
      if (where.indexOf(what) === 0) count += 1;
    }
  }
  return count;
}

const Activities = {
  TRACK: 0,
  isTrack: () => contains(tokens, ['отследи', 'посыл']) === TWO_WORDS
      || contains(tokens, ['определ', 'посыл']) === TWO_WORDS
      || contains(tokens, ['где', 'посыл']) === TWO_WORDS,
  TRANSIT: 1,
  isTransit: () => contains(tokens, ['какие', 'посыл', 'не', 'достав']) === FOUR_WORDS
      || contains(tokens, ['какие', 'посыл', 'недостав']) === THREE_WORDS
      || contains(tokens, ['какие', 'посыл', 'едут']) === THREE_WORDS
      || contains(tokens, ['сколько', 'посыл', 'в', 'пути']) === FOUR_WORDS,
  NOTIFICATION: 2,
  isNotification: () => contains(tokens, ['включ', 'уведом', 'о', 'посыл']) === FOUR_WORDS
      || contains(tokens, ['уведом', 'о', 'посыл']) === THREE_WORDS,
  NOTIFICATION_INPUT_TRACK: 3,
  NOTIFICATION_ACCEPT: 4,
  RENAME: 5,
  isRename: () => contains(tokens, ['измен', 'назван', 'посыл']) === THREE_WORDS
      || contains(tokens, ['редактир', 'назван', 'посыл']) === THREE_WORDS
      || contains(tokens, ['переимен', 'назван', 'посыл']) === THREE_WORDS
      || contains(tokens, ['переимен', 'посыл']) === TWO_WORDS,
  RENAME_INPUT: 6,
};

router.post('/webhook', async (req, res) => {
  const { body } = req;
  const {
    request,
    session,
    version,
  } = body;
  session.user = { userId: 245481845 }; // удалить это на проде

  const { session_id } = session;
  const static_required_data = {
    session,
    version,
  };
  const session_payload = sessions[session_id];

  tokens = request.nlu.tokens;

  if (session_payload) {
    if (session_payload.act === Activities.TRACK) {
      if (request.command.length < BAD_PACKAGE_NUMBER_LENGTH && request.command !== 'подробнее') {
        res.send({
          response: {
            text: 'Упс, кажется в трек-номере есть ошибочка.',
            tts: 'Упс, кажется в трек-номере есть ошибочка.',
            end_session: true,
          },
          ...static_required_data,
        });
      } else if (request.command === 'подробнее') {
        const packageData = await await Package.findOne({ packageNumber: session_payload.trackNumber }).exec();
        const packageEventsLength = packageData.events.length;
        const { serviceName } = packageData.events[packageEventsLength - 1];
        const deliveredDateTime = packageData.trackDeliveredDateTime;

        let lastOperation;
        let lastPlace;
        let lastWeight;
        let lastService;

        if (serviceName === 'Track24') {
          lastOperation = packageData.events[packageEventsLength - TWO_ELEMENTS].operationAttributeOriginal === '' ? 'неизвестно' : packageData.events[packageEventsLength - TWO_ELEMENTS].operationAttributeOriginal;
          lastPlace = packageData.events[packageEventsLength - TWO_ELEMENTS].operationPlaceNameOriginal === '' ? 'неизвестно' : packageData.events[packageEventsLength - TWO_ELEMENTS].operationPlaceNameOriginal;
          lastWeight = packageData.events[packageEventsLength - TWO_ELEMENTS].itemWeight === '' ? 'неизвестно' : packageData.events[packageEventsLength - TWO_ELEMENTS].itemWeight;
          lastService = packageData.events[packageEventsLength - TWO_ELEMENTS].serviceName === '' ? 'неизвестно' : packageData.events[packageEventsLength - TWO_ELEMENTS].serviceName;
        } else {
          lastOperation = packageData.events[packageEventsLength - 1].operationAttributeOriginal;
          lastPlace = packageData.events[packageEventsLength - 1].operationPlaceNameOriginal;
          lastWeight = packageData.events[packageEventsLength - 1].itemWeight;
          lastService = packageData.events[packageEventsLength - 1].serviceName;
        }

        res.send({
          response: {
            text: `Подробности посылки: \nМаршрут: ${lastPlace} \nВес: ${lastWeight} \n Отправитель: ${lastService} \nПриблизительная дата прибытия: ${deliveredDateTime}.`,
            tts: `Последний статус: ${lastOperation}.`,
            end_session: true,
          },
          ...static_required_data,
        });

        delete sessions[session_id];
      } else {
        const { userId } = session.user;
        let packageData = await Package.findOne({packageNumber: request.command}).exec();

        if (packageData === null) {
          packageData = await addPackage(userId, {packageNumber: request.command, packageName: null});
        }

        if (packageData.events.length === 1) {
          res.send({
            response: {
              text: 'Я буду внимательно следить за перемещением посылки, а пока что стоит подождать, пока появятся первые данные о перемещении.',
              tts: 'Я буду внимательно следить за перемещением посылки, а пока что стоит подождать, пока появятся первые данные о перемещении.',
              end_session: true,
            },
            ...static_required_data,
          });
          delete sessions[session_id];
          return;
        }

        const packageEventsLength = packageData.events.length;
        const lastOperation = packageData.events[packageEventsLength - 1].operationAttributeOriginal === undefined ? packageData.events[packageEventsLength - TWO_WORDS].operationAttributeOriginal : packageData.events[packageEventsLength - 1].operationAttributeOriginal;


        res.send({
          response: {
            text: `Последний статус: ${lastOperation}.`,
            tts: `Последний статус: ${lastOperation}.`,
            end_session: false,
            buttons: [{
              title: 'Подробнее',
              payload: {
                type: 0,
              },
            },
            ],
          },
          ...static_required_data,
        });
        sessions[session_id] = {
          act: Activities.TRACK, trackNumber: request.command,
        };
      }
    } else if (session_payload.act === Activities.NOTIFICATION) {
      const { userId } = session.user;

      if (request.command === 'обо всех') {
        const userPackages = await Package.find({userId}).exec();
        if (userPackages) {
          await Package.updateMany({
            userId,
          }, {
            $set: {
              notification: true,
            },
          });

          res.send({
            response: {
              text: 'Теперь разрешите присылать Вам уведомления в мини-приложении.',
              tts: 'Теперь разрешите присылать Вам уведомления в мини-приложении.',
              card: {
                type: 'MiniApp',
                url: 'https://vk.com/track',
              },
              end_session: true,
            },
            ...static_required_data,
          });

          delete sessions[session_id];
        } else {
          res.send({
            response: {
              text: 'У Вас нет посылок.',
              tts: 'У Вас нет посылок.',
              end_session: true,
            },
            ...static_required_data,
          });

          delete sessions[session_id];
        }
      } else if (request.command === 'о конкретной') {
        res.send({
          response: {
            text: 'Введите трек-номер посылки, или её название.',
            tts: 'Введите трек-номер посылки, или её название.',
            end_session: false,
          },
          ...static_required_data,
        });

                sessions[session_id] = {act: Activities.NOTIFICATION_INPUT_TRACK};
            }
        } else if (session_payload.act === Activities.NOTIFICATION_INPUT_TRACK) {
            const {userId} = session.user;

            const
                userPackagesWithName = await Package.findOne({
                    userId,
                    packageName: request.original_utterance
                }).exec(),
                userPackagesWithNumber = await Package.findOne({
                    userId,
                    packageNumber: request.original_utterance
                }).exec()
            ;

            if (userPackagesWithName) {
                res.send({
                    response: {
                        text: `Подтвердите трек-номер посылки — ${userPackages.packageNumber}.`,
                        tts: `Подтвердите трек-номер посылки — ${userPackages.packageNumber}.`,
                        end_session: false,
                        buttons: [{
                            title: 'Верно',
                            payload: {
                                type: 0,
                            },
                        },
                            {
                                title: 'Отмена',
                                payload: {
                                    type: 1,
                                },
                            },
                        ],
                    },
                    ...static_required_data,
                });

                sessions[session_id] = {
                    act: Activities.NOTIFICATION_ACCEPT, trackNumber: userPackagesWithName.packageNumber,
                };
            } else if (userPackagesWithNumber) {
                await Package.updateOne({
                    userId,
                    packageNumber: request.original_utterance,
                }, {
                    $set: {
                        notification: true,
                    },
                });

                res.send({
                    response: {
                        text: 'Теперь разрешите присылать Вам уведомления в мини-приложении.',
                        tts: 'Теперь разрешите присылать Вам уведомления в мини-приложении.',
                        card: {
                            type: 'MiniApp',
                            url: 'https://vk.com/track',
                        },
                        end_session: true,
                    },
                    ...static_required_data,
                });

                delete sessions[session_id];
            } else {
                res.send({
                    response: {
                        text: 'Я не нашла у Вас такой посылки.',
                        tts: 'Я не нашла у Вас такой посылки.',
                        end_session: true,
                    },
                    ...static_required_data,
                });

                delete sessions[session_id];
            }
        } else if (session_payload.act === Activities.NOTIFICATION_ACCEPT) {
            if (request.command === 'верно') {
                const {userId} = session.user;
                await Package.updateOne({
                    userId,
                    packageNumber: session_payload.trackNumber,
                }, {
                    $set: {
                        notification: true,
                    },
                });

                res.send({
                    response: {
                        text: 'Теперь разрешите присылать Вам уведомления в мини-приложении.',
                        tts: 'Теперь разрешите присылать Вам уведомления в мини-приложении.',
                        card: {
                            type: 'MiniApp',
                            url: 'https://vk.com/track',
                        },
                        end_session: true,
                    },
                    ...static_required_data,
                });

                delete sessions[session_id];
            } else if (request.command === 'отмена') {
                res.send({
                    response: {
                        text: 'Если что, возвращайтесь! Помогу отследить посылку.',
                        tts: 'Если что, возвращайтесь! Помогу отследить посылку.',
                        end_session: true,
                    },
                    ...static_required_data,
                });

                delete sessions[session_id];
            }
            return;
        } else if (session_payload.act === Activities.RENAME) {
            const {userId} = session.user;

            const
                userPackagesWithName = await Package.findOne({
                    userId,
                    packageName: request.original_utterance
                }).exec(),
                userPackagesWithNumber = await Package.findOne({
                    userId,
                    packageNumber: request.original_utterance
                }).exec()
            ;

            if (userPackagesWithName) {
                res.send({
                    response: {
                        text: 'Введите новое название.',
                        tts: 'Введите новое название.',
                        end_session: false,
                    },
                    ...static_required_data,
                });

                sessions[session_id] = {
                    act: Activities.RENAME_INPUT, trackNumber: userPackagesWithName.packageNumber,
                };
            } else if (userPackagesWithNumber) {
                res.send({
                    response: {
                        text: 'Введите новое название.',
                        tts: 'Введите новое название.',
                        end_session: false,
                    },
                    ...static_required_data,
                });

                sessions[session_id] = {
                    act: Activities.RENAME_INPUT, trackNumber: userPackagesWithNumber.packageNumber,
                };
            } else {
                res.send({
                    response: {
                        text: 'Я не нашла у Вас такой посылки.',
                        tts: 'Я не нашла у Вас такой посылки.',
                        end_session: true,
                    },
                    ...static_required_data,
                });

                delete sessions[session_id];
            }
        } else if (session_payload.act === Activities.RENAME_INPUT) {
            const {userId} = session.user;
            const newName = {
                newPackageName: request.original_utterance.trim(),
            };

            await changePackageName(userId, session_payload.trackNumber, newName);

            res.send({
                response: {
                    text: 'Название посылки сохранено.',
                    tts: 'Название посылки сохранено.',
                    end_session: true,
                },
                ...static_required_data,
            });

            delete sessions[session_id];
        }
    }

    if (session.user === undefined) {
        res.send({
            response: {
                text: 'Я могу помочь с отслеживанием посылки — переходите в мини-приложение!',
                tts: 'Я могу помочь с отслеживанием посылки — переходите в мини-приложение!',
                card: {
                    type: 'MiniApp',
                    url: 'https://vk.com/track',
                },
                end_session: true,
            },
            ...static_required_data,
        });
    } else if (Activities.isTrack()) {
        res.send({
            response: {
                text: 'Чтобы отследить посылку, введите трек-номер.',
                tts: 'Чтобы отследить посылку, введите трек-номер.',
                end_session: false,
            },
            ...static_required_data,
        });
        sessions[session_id] = {
            act: Activities.TRACK,
        };
    } else if (Activities.isTransit()) {
        const
            {userId} = session.user,
            userPackages = await Package.find({userId, deliveredStatus: 0})
        ;

        if (userPackages.length) {
            let message = 'У Вас в пути';
            const packegeWithName = [];

            if (userPackages.length >= PACKAGE_LENGTH) {
                userPackages.forEach((el) => {
                    if (el.packageName !== null && el.packageName !== undefined) packegeWithName.push(el);
                });

                if (packegeWithName.length >= PACKAGE_LENGTH) {
                    for (let i = 0; i < PACKAGE_LENGTH; i += 1) {
                        if (i !== 2) {
                            message += ` ${packegeWithName[i].packageName},`;
                        } else {
                            const remainPack = userPackages.length - PACKAGE_LENGTH;
                            let lastWord;
                            if (remainPack === 1) {
                                lastWord = remainPack === 1 ? 'посылка' : 'посылки';
                            } else if (remainPack < 5 && remainPack > 1) {
                                lastWord = 'посылки';
                            } else {
                                lastWord = 'посылок';
                            }
                            message += ` ${packegeWithName[i].packageName} и еще ${remainPack} ${lastWord}.`;
                        }
                    }
                } else {
                    const lastWord = userPackages.length < 5 && userPackages.length > 1 ? 'посылки' : 'посылок';
                    message += ` ${userPackages.length} ${lastWord}.`;
                }
            } else if (userPackages.length === 1) {
                message += ' 1 посылка';
            } else {
                message += ` ${userPackages.length} ${userPackages.length < 5 && userPackages.length > 1 ? 'посылки' : 'посылок'}.`;
            }
            res.send({
                response: {
                    text: message,
                    tts: message,
                    end_session: false,
                },
                ...static_required_data,
            });
        } else {
            res.send({
                response: {
                    text: 'У Вас нет активных посылок.',
                    tts: 'У Вас нет активных посылок.',
                    end_session: true,
                },
                ...static_required_data,
            });
        }
    } else if (Activities.isNotification()) {
        res.send({
            response: {
                text: 'Вам нужны уведомления о всех посылках, или о конкретной?',
                tts: 'Вам нужны уведомления о всех посылках, или о конкретной?',
                end_session: false,
                buttons: [{
                    title: 'Обо всех',
                    payload: {
                        type: 0,
                    },
                },
                    {
                        title: 'О конкретной',
                        payload: {
                            type: 1,
                        },
                    },
                ],
            },
            ...static_required_data,
        });
        sessions[session_id] = {
            act: Activities.NOTIFICATION,
        };
    } else if (Activities.isRename()) {
        res.send({
            response: {
                text: 'Введите название посылки, или её трек-номер.',
                tts: 'Введите название посылки, или её трек-номер.',
                end_session: false,
            },
            ...static_required_data,
        });
        sessions[session_id] = {
            act: Activities.RENAME,
        };
    }
});

module.exports = router;
