import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { chat, addOneMessage, Generate, name2, system_message_types, saveSettingsDebounced, deleteLastMessage } from '../../../../script.js';
import { isTrueBoolean } from '../../../utils.js';
import { extension_settings } from '../../../extensions.js';

function registerGenOverrideCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'gen',
        callback: async (args, text) => {
            if (!text) return '';

            // 사용자 아이디어: 가짜 메시지를 삽입하고 swipe로 덮어쓰기
            // as 옵션이 지정되었으면 해당 이름으로, 아니면 기본 캐릭터 이름으로 설정
            const senderName = (args.as ? String(args.as) : String(name2)) || 'System';
            const isSystem = senderName.toLowerCase() === 'system';
            const isVisible = isTrueBoolean(String(args.visible ?? 'true'));

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

            // 빈 메시지를 채팅창 구석에 삽입 (sendas와 동일한 효과)
            chat.push(msg);
            addOneMessage(msg);

            // DOM 렌더링을 위해 잠깐 대기
            await new Promise(r => setTimeout(r, 0));

            // visible=false 라면 방금 삽입한 메시지 DOM을 숨김
            if (!isVisible) {
                $('#chat .mes:last').hide();
            }

            // Generate 함수 호출.
            // swipe 타입은 마지막 메시지 내용을 지우고 새로 생성 (스트리밍 지원)
            // quiet_prompt 옵션으로 프롬프트 덮어쓰기
            // quietToLoud: true 옵션은 quiet 프롬프트를 일반 생성처럼 출력하게 해줌
            await Generate('swipe', { quiet_prompt: String(text), quietToLoud: false });

            // 생성이 다 끝났을 때의 텍스트 반환 (파이프 전달용)
            // swipe 후에는 해당 메시지가 업데이트 되어있음
            const lastMesObj = chat[chat.length - 1];
            
            // 빈 말풍선을 위한 쓰레기 스와이프("") 청소
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

            const resultText = lastMesObj.mes;

            // visible=false 라면 백그라운드 스트리밍 용도이므로 완성된 메시지를 채팅에서 완전히 삭제
            if (!isVisible) {
                await deleteLastMessage();
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
                description: 'Whether to show the streaming process in the chat (true) or generate quietly in the background (false).',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'true',
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

// ST_APP_READY 이벤트 또는 이미 초기화된 경우를 대비한 실행 루틴
jQuery(async () => {
    const extensionName = "gen-stream-override";
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
    const defaultSettings = { enable: true };
    
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const settingsHtml = await $.get(`${extensionFolderPath}/index.html`);
    $("#extensions_settings").append(settingsHtml);

    $("#genStreamOverride_enable").prop("checked", extension_settings[extensionName].enable);
    
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
