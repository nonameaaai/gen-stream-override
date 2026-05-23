import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { chat, addOneMessage, Generate, name2, system_message_types, saveSettingsDebounced, deleteLastMessage } from '../../../../script.js';
import { isTrueBoolean } from '../../../utils.js';
import { extension_settings } from '../../../extensions.js';

const extensionName = "gen-stream-override";

function registerGenOverrideCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'gen',
        callback: async (args, text) => {
            if (!text) return '';

            const senderName = (args.as ? String(args.as) : String(name2)) || 'System';
            const isSystem = senderName.toLowerCase() === 'system';

            // visible 인자가 명시적으로 주어지지 않으면 설정값을 폴백으로 사용
            const visibleArg = args.visible;
            const isVisible = visibleArg !== undefined
                ? isTrueBoolean(String(visibleArg))
                : (extension_settings[extensionName]?.visibleByDefault ?? false);

            let msg = {
                name: senderName,
                is_user: false,
                is_system: isSystem,
                is_name: true,
                send_date: Date.now(),
                mes: "",
                extra: {
                    type: isSystem ? system_message_types.GENERIC : undefined
                }
            };

            chat.push(msg);
            addOneMessage(msg);

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            if (!isVisible) {
                $('#chat .mes:last').hide();
            }

            let resultText = '';
            let generateSuccess = false;
            try {
                await Generate('swipe', { quiet_prompt: String(text), quietToLoud: false });
                generateSuccess = true;

                const lastMesObj = chat[chat.length - 1];

                if (lastMesObj && Array.isArray(lastMesObj.swipes)) {
                    const emptyIndex = lastMesObj.swipes.indexOf('');
                    if (emptyIndex !== -1) {
                        lastMesObj.swipes.splice(emptyIndex, 1);
                        if (Array.isArray(lastMesObj.swipe_info)) {
                            lastMesObj.swipe_info.splice(emptyIndex, 1);
                        }
                        if (lastMesObj.swipe_id > emptyIndex) {
                            lastMesObj.swipe_id--;
                        } else if (lastMesObj.swipe_id === emptyIndex) {
                            lastMesObj.swipe_id = 0;
                        }
                    }
                }

                resultText = lastMesObj ? lastMesObj.mes : '';
            } catch (error) {
                console.error("'/gen' Override Generation failed or aborted:", error);
                throw error;
            } finally {
                if (!generateSuccess || !isVisible) {
                    await deleteLastMessage();
                }
            }

            return resultText;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'as',
                description: 'The character to send the message as, overriding the default.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'visible',
                description: 'Whether to show the streaming process in the chat (true) or generate quietly in the background (false). If omitted, uses the extension setting.',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            })
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'The quiet prompt or instruction to generate text.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true
            })
        ],
        helpString: 'Generates text quietly (like /gen) but streams the output directly into a chat bubble on screen.',
        returns: 'The generated text.'
    }));
}

jQuery(async () => {
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
    const defaultSettings = { enable: true, visibleByDefault: false };

    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    // 기존 설정에 visibleByDefault가 없을 경우 기본값 보장
    if (extension_settings[extensionName].visibleByDefault === undefined) {
        extension_settings[extensionName].visibleByDefault = defaultSettings.visibleByDefault;
    }

    const settingsHtml = await $.get(`${extensionFolderPath}/index.html`);
    $("#extensions_settings").append(settingsHtml);

    $("#genStreamOverride_enable").prop("checked", extension_settings[extensionName].enable);
    $("#genStreamOverride_visibleByDefault").prop("checked", extension_settings[extensionName].visibleByDefault);

    $("#genStreamOverride_enable").on("change", (event) => {
        const value = Boolean($(event.target).prop("checked"));
        const oldValue = extension_settings[extensionName].enable;

        extension_settings[extensionName].enable = value;
        saveSettingsDebounced();

        if (oldValue !== value) {
            if (value) {
                registerGenOverrideCommand();
            } else {
                toastr.info('설정 저장을 위해 3초 후 페이지가 새로고침 됩니다.', 'gen-stream-override 해제');
                setTimeout(() => {
                    location.reload();
                }, 3000);
            }
        }
    });

    $("#genStreamOverride_visibleByDefault").on("change", (event) => {
        extension_settings[extensionName].visibleByDefault = Boolean($(event.target).prop("checked"));
        saveSettingsDebounced();
    });

    const initCommand = () => {
        if (extension_settings[extensionName].enable) {
            registerGenOverrideCommand();
        }
    };

    if (window.SillyTavern) {
        const ctx = window.SillyTavern.getContext();
        if (ctx && ctx.eventSource && ctx.event_types) {
            ctx.eventSource.on(ctx.event_types.APP_READY, initCommand);
        } else {
            initCommand();
        }
    } else {
        setTimeout(initCommand, 500);
    }
});
