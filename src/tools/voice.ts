import fs from 'fs';
import path from 'path';

const KEY_PATH = path.join(process.cwd(), 'service_account.json');

/**
 * Convert text to an OGG audio buffer using Google Cloud TTS.
 * Uses the existing service_account.json for auth.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
    // Dynamic import to avoid crash if not installed
    const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');

    const client = new TextToSpeechClient({
        keyFilename: KEY_PATH,
    });

    const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: {
            languageCode: 'he-IL',
            name: 'he-IL-Wavenet-A',  // High quality Hebrew female voice
            ssmlGender: 'FEMALE' as any,
        },
        audioConfig: {
            audioEncoding: 'OGG_OPUS' as any,
            speakingRate: 1.0,
            pitch: 0,
        },
    });

    if (!response.audioContent) {
        throw new Error('TTS returned empty audio.');
    }

    return Buffer.from(response.audioContent as Uint8Array);
}
