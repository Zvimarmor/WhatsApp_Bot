"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.textToSpeech = textToSpeech;
const path_1 = __importDefault(require("path"));
const KEY_PATH = path_1.default.join(process.cwd(), 'service_account.json');
/**
 * Convert text to an OGG audio buffer using Google Cloud TTS.
 * Uses the existing service_account.json for auth.
 */
async function textToSpeech(text) {
    // Dynamic import to avoid crash if not installed
    const { TextToSpeechClient } = await Promise.resolve().then(() => __importStar(require('@google-cloud/text-to-speech')));
    const client = new TextToSpeechClient({
        keyFilename: KEY_PATH,
    });
    const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: {
            languageCode: 'he-IL',
            name: 'he-IL-Wavenet-A', // High quality Hebrew female voice
            ssmlGender: 'FEMALE',
        },
        audioConfig: {
            audioEncoding: 'OGG_OPUS',
            speakingRate: 1.0,
            pitch: 0,
        },
    });
    if (!response.audioContent) {
        throw new Error('TTS returned empty audio.');
    }
    return Buffer.from(response.audioContent);
}
//# sourceMappingURL=voice.js.map