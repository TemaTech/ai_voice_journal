import { Buffer } from 'buffer';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useRef, useState } from 'react';
import { GeminiLiveService } from '../services/gemini-live';

export const useAudioRecorder = (geminiService: GeminiLiveService) => {
    const [isRecording, setIsRecording] = useState(false);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const shouldContinue = useRef(false);
    const isProcessingChunk = useRef(false); // Lock to prevent concurrent recordings

    const RECORDING_OPTIONS: Audio.RecordingOptions = {
        android: {
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.DEFAULT,
            audioEncoder: Audio.AndroidAudioEncoder.DEFAULT, 
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 256000,  // 高ビットレートで品質向上
        },
        ios: {
            extension: '.wav',
            audioQuality: Audio.IOSAudioQuality.MAX,  // 最高品質に変更
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 256000,  // 高ビットレートで品質向上
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
        },
        web: {
            mimeType: 'audio/wav',
            bitsPerSecond: 256000,
        },
    };

    const recordChunk = useCallback(async () => {
        // If already processing or should stop, exit
        if (isProcessingChunk.current || !shouldContinue.current) {
            return;
        }

        // Acquire lock
        isProcessingChunk.current = true;

        try {
            console.log('Recording chunk...');
            const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
            recordingRef.current = recording;

            // Record for 500ms (shorter for more responsive recognition)
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check if we should stop
            if (!shouldContinue.current) {
                try {
                    await recording.stopAndUnloadAsync();
                } catch (e) {}
                isProcessingChunk.current = false;
                return;
            }

            await recording.stopAndUnloadAsync();
            recordingRef.current = null;
            
            const uri = recording.getURI();
            if (uri) {
                const base64WithHeader = await FileSystem.readAsStringAsync(uri, {
                    encoding: 'base64'
                });
                
                // WAVファイルには44バイトのヘッダーがある。
                // Base64では3バイト=4文字なので、44バイト≒60文字をスキップ
                // 正確には44バイト = ceil(44/3)*4 = 60文字（ただし境界が揃わない可能性がある）
                // 安全のため、Buffer経由で処理
                const fullBuffer = Buffer.from(base64WithHeader, 'base64');
                const pcmData = fullBuffer.slice(44); // WAVヘッダー（44バイト）を除去
                const base64Pcm = pcmData.toString('base64');
                
                // Send to Gemini
                console.log('Sending audio chunk, PCM length:', pcmData.length);
                geminiService.sendAudioChunk(base64Pcm);

                // Cleanup
                await FileSystem.deleteAsync(uri, { idempotent: true });
            }

        } catch (error) {
            console.error('Recording chunk error:', error);
        } finally {
            // Release lock
            isProcessingChunk.current = false;
            
            // Schedule next chunk if should continue
            if (shouldContinue.current) {
                // 即座に次の録音を開始（ギャップなし）
                setImmediate(recordChunk);
            }
        }
    }, [geminiService]);

    const startRecording = useCallback(async () => {
        console.log('startRecording called');
        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) {
                console.log('Permission denied');
                return;
            }
            console.log('Permission granted');

            // Set audio mode - enable both recording and playback simultaneously
            // Use speaker mode for hands-free conversation
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,  // Use speaker on Android
                // iOS specific settings for speaker mode
                interruptionModeIOS: 1, // INTERRUPTION_MODE_IOS_DO_NOT_MIX
                interruptionModeAndroid: 1, // INTERRUPTION_MODE_ANDROID_DO_NOT_MIX
            });
            console.log('Audio mode set for speaker mode');

            shouldContinue.current = true;
            setIsRecording(true);
            console.log('Starting recording loop...');
            
            // Start the first chunk
            recordChunk();
        } catch (err) {
            console.error('Failed to start recording', err);
        }
    }, [recordChunk]);

    const stopRecording = useCallback(async () => {
        console.log('Stopping recording...');
        shouldContinue.current = false;
        setIsRecording(false);
        
        // Stop any ongoing recording
        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch(e) {
                // Ignore - might already be stopped
            }
            recordingRef.current = null;
        }
        
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
        });
    }, []);

    return {
        isRecording,
        startRecording,
        stopRecording
    };
};
