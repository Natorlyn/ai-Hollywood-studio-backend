// Alternative Video Generation System
// Uses: ElevenLabs + Stock Media + FFmpeg for professional video creation

const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class AlternativeVideoGenerator {
    constructor(apiKeys) {
        this.elevenLabsKey = apiKeys.elevenLabs;
        this.pexelsKey = apiKeys.pexels; // Free API key
        this.unsplashKey = apiKeys.unsplash; // Free API key
        this.outputDir = './generated_videos';
    }

    async generateVideo(videoRequest) {
        const { title, category, duration, tone, voiceStyle, visualStyle } = videoRequest;
        
        console.log(`🎬 Starting video generation: ${title}`);
        
        try {
            // Step 1: Generate script based on category and title
            const script = await this.generateScript(title, category, duration, tone);
            
            // Step 2: Generate voiceover using ElevenLabs
            const audioFile = await this.generateVoiceover(script, voiceStyle);
            
            // Step 3: Get stock videos and images
            const visualAssets = await this.getVisualAssets(category, script, visualStyle);
            
            // Step 4: Compile video using FFmpeg
            const videoFile = await this.compileVideo(audioFile, visualAssets, duration);
            
            // Step 5: Add Hollywood-style effects
            const finalVideo = await this.addHollywoodEffects(videoFile, visualStyle);
            
            return {
                success: true,
                videoPath: finalVideo,
                script: script,
                duration: duration,
                assets: visualAssets.length
            };
            
        } catch (error) {
            console.error('Video generation failed:', error);
            throw new Error(`Video generation failed: ${error.message}`);
        }
    }

    async generateScript(title, category, duration, tone) {
        // AI-powered script generation based on category templates
        const scriptTemplates = {
            'personal-finance': {
                hook: "What if I told you that {statistic} of people are making this crucial financial mistake?",
                sections: [
                    "Understanding the fundamentals",
                    "Common mistakes to avoid", 
                    "Proven strategies that work",
                    "Step-by-step implementation",
                    "Real-world examples",
                    "Action steps you can take today"
                ]
            },
            'investing': {
                hook: "The investing strategy that {experts} don't want you to know about.",
                sections: [
                    "Market analysis and trends",
                    "Risk assessment strategies",
                    "Portfolio diversification techniques", 
                    "Timing and execution",
                    "Long-term wealth building",
                    "Your next steps"
                ]
            },
            'cryptocurrency': {
                hook: "Cryptocurrency just hit a major milestone that changes everything.",
                sections: [
                    "Current crypto landscape",
                    "Technology breakdown",
                    "Investment opportunities",
                    "Risk management",
                    "Future predictions",
                    "Getting started safely"
                ]
            },
            'ai-technology': {
                hook: "AI technology is revolutionizing industries faster than predicted.",
                sections: [
                    "Current AI developments",
                    "Industry impact analysis",
                    "Business opportunities",
                    "Implementation strategies",
                    "Future implications",
                    "Competitive advantages"
                ]
            }
        };

        const template = scriptTemplates[category] || scriptTemplates['personal-finance'];
        const wordsPerMinute = 150; // Average speaking pace
        const totalWords = duration * wordsPerMinute;
        const wordsPerSection = Math.floor(totalWords / (template.sections.length + 2)); // +2 for intro/outro

        let script = {
            title: title,
            hook: template.hook.replace('{statistic}', '73%').replace('{experts}', 'Wall Street insiders'),
            sections: [],
            totalWords: 0
        };

        // Generate introduction
        script.sections.push({
            type: 'introduction',
            content: `Welcome to AI Hollywood Studio. Today we're diving deep into ${title.toLowerCase()}. ${script.hook} By the end of this video, you'll have a complete understanding of how to apply these strategies to your own situation.`,
            duration: 30
        });

        // Generate main content sections
        template.sections.forEach((sectionTitle, index) => {
            const content = this.generateSectionContent(sectionTitle, category, wordsPerSection, tone);
            script.sections.push({
                type: 'content',
                title: sectionTitle,
                content: content,
                duration: Math.floor((duration - 60) / template.sections.length) // Minus intro/outro time
            });
        });

        // Generate conclusion
        script.sections.push({
            type: 'conclusion',
            content: `That wraps up our comprehensive guide to ${title.toLowerCase()}. Remember, the key to success is taking action on what you've learned today. Subscribe for more professional content, and I'll see you in the next video.`,
            duration: 30
        });

        return script;
    }

    generateSectionContent(sectionTitle, category, wordCount, tone) {
        // Content generation templates based on tone
        const toneStyles = {
            'educational': 'Research shows that',
            'engaging': 'Here\'s what most people don\'t realize:',
            'professional': 'Industry analysis indicates',
            'casual': 'Let me break this down for you:'
        };

        const starter = toneStyles[tone] || toneStyles['professional'];
        
        // Generate contextual content based on section and category
        const contentLibrary = {
            'Understanding the fundamentals': `${starter} mastering the basics is crucial for long-term success. We need to establish a solid foundation before moving to advanced strategies. This involves understanding key principles, terminology, and how different elements work together to create a comprehensive approach.`,
            
            'Common mistakes to avoid': `${starter} avoiding these critical errors can save you thousands of dollars and months of frustration. Most beginners fall into predictable traps that experienced professionals know how to sidestep. Let's examine the most costly mistakes and how to prevent them.`,
            
            'Proven strategies that work': `${starter} these time-tested methods have consistently delivered results across different market conditions. We'll explore strategies that have been validated by both academic research and real-world application, giving you confidence in your approach.`,
            
            'Current market analysis': `${starter} understanding current market dynamics is essential for making informed decisions. We'll examine recent trends, key indicators, and what they mean for your strategy moving forward.`
        };

        return contentLibrary[sectionTitle] || `${starter} this section covers ${sectionTitle.toLowerCase()} with practical insights and actionable strategies you can implement immediately.`;
    }

    async generateVoiceover(script, voiceStyle) {
        console.log('🎤 Generating voiceover with ElevenLabs...');
        
        // Combine all script sections into full text
        const fullText = script.sections.map(section => section.content).join('\n\n');
        
        // ElevenLabs voice mapping
        const voiceMap = {
            'professional-male': 'EXAVITQu4vr4xnSDxMaL', // Premade voice ID
            'professional-female': '21m00Tcm4TlvDq8ikWAM',
            'authoritative-male': 'VR6AewLTigWG4xSOukaG',
            'friendly-female': 'jsCqWAovK2LkecY7zXl4',
            'energetic-male': 'pFZP5JQG7iQjIQuC4Bku'
        };

        const voiceId = voiceMap[voiceStyle] || voiceMap['professional-male'];
        
        try {
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text: fullText,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.5,
                        style: 0.5,
                        use_speaker_boost: true
                    }
                },
                {
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsKey
                    },
                    responseType: 'arraybuffer'
                }
            );

            const audioFileName = `audio_${Date.now()}.mp3`;
            const audioPath = path.join(this.outputDir, audioFileName);
            
            await fs.writeFile(audioPath, response.data);
            console.log('✅ Voiceover generated successfully');
            
            return audioPath;
            
        } catch (error) {
            console.error('ElevenLabs API error:', error.response?.data || error.message);
            throw new Error('Failed to generate voiceover');
        }
    }

    async getVisualAssets(category, script, visualStyle) {
        console.log('📹 Gathering visual assets...');
        
        const visualKeywords = this.getVisualKeywords(category, visualStyle);
        const assets = [];
        
        try {
            // Get stock videos from Pexels
            for (let keyword of visualKeywords.slice(0, 5)) { // Limit to 5 videos
                const videos = await this.searchPexelsVideos(keyword);
                if (videos.length > 0) {
                    assets.push({
                        type: 'video',
                        url: videos[0].video_files[0].link,
                        duration: 10, // Use 10-second clips
                        keyword: keyword
                    });
                }
            }

            // Get stock images from Unsplash for transitions
            for (let keyword of visualKeywords.slice(0, 3)) {
                const images = await this.searchUnsplashImages(keyword);
                if (images.length > 0) {
                    assets.push({
                        type: 'image',
                        url: images[0].urls.regular,
                        duration: 3, // 3-second image displays
                        keyword: keyword
                    });
                }
            }

            console.log(`✅ Gathered ${assets.length} visual assets`);
            return assets;
            
        } catch (error) {
            console.error('Failed to gather visual assets:', error);
            // Return placeholder assets if APIs fail
            return this.getPlaceholderAssets(category);
        }
    }

    getVisualKeywords(category, visualStyle) {
        const categoryKeywords = {
            'personal-finance': ['money', 'calculator', 'budget', 'savings', 'financial planning', 'investment', 'banking'],
            'investing': ['stock market', 'trading', 'portfolio', 'charts', 'financial growth', 'business', 'success'],
            'cryptocurrency': ['bitcoin', 'blockchain', 'digital currency', 'technology', 'computer', 'finance'],
            'ai-technology': ['artificial intelligence', 'computer', 'technology', 'data', 'innovation', 'future', 'robotics'],
            'startup': ['business', 'entrepreneur', 'office', 'team', 'innovation', 'growth', 'success'],
            'business': ['office', 'meeting', 'professional', 'team', 'corporate', 'success', 'growth']
        };

        const styleModifiers = {
            'corporate': ['professional', 'clean', 'office'],
            'modern': ['sleek', 'contemporary', 'digital'],
            'minimalist': ['simple', 'clean', 'minimal'],
            'cinematic': ['dramatic', 'high quality', 'cinematic']
        };

        const baseKeywords = categoryKeywords[category] || categoryKeywords['business'];
        const modifiers = styleModifiers[visualStyle] || [];
        
        return [...baseKeywords, ...modifiers];
    }

    async searchPexelsVideos(query) {
        try {
            const response = await axios.get('https://api.pexels.com/videos/search', {
                params: {
                    query: query,
                    per_page: 5,
                    orientation: 'landscape'
                },
                headers: {
                    'Authorization': this.pexelsKey
                }
            });
            
            return response.data.videos || [];
        } catch (error) {
            console.error('Pexels API error:', error.message);
            return [];
        }
    }

    async searchUnsplashImages(query) {
        try {
            const response = await axios.get('https://api.unsplash.com/search/photos', {
                params: {
                    query: query,
                    per_page: 5,
                    orientation: 'landscape'
                },
                headers: {
                    'Authorization': `Client-ID ${this.unsplashKey}`
                }
            });
            
            return response.data.results || [];
        } catch (error) {
            console.error('Unsplash API error:', error.message);
            return [];
        }
    }

    async compileVideo(audioPath, visualAssets, duration) {
        console.log('🎬 Compiling video with FFmpeg...');
        
        try {
            // Download visual assets
            const localAssets = await this.downloadAssets(visualAssets);
            
            // Create video compilation script
            const videoScript = await this.createFFmpegScript(audioPath, localAssets, duration);
            
            // Execute FFmpeg compilation
            const outputPath = path.join(this.outputDir, `compiled_${Date.now()}.mp4`);
            execSync(videoScript.replace('OUTPUT_PATH', outputPath), { 
                stdio: 'inherit',
                timeout: 300000 // 5 minute timeout
            });
            
            console.log('✅ Video compiled successfully');
            return outputPath;
            
        } catch (error) {
            console.error('Video compilation failed:', error);
            throw new Error('Failed to compile video');
        }
    }

    async downloadAssets(assets) {
        console.log('⬇️ Downloading visual assets...');
        const localAssets = [];
        
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            try {
                const response = await axios.get(asset.url, { responseType: 'arraybuffer' });
                const extension = asset.type === 'video' ? 'mp4' : 'jpg';
                const fileName = `asset_${i}_${Date.now()}.${extension}`;
                const filePath = path.join(this.outputDir, fileName);
                
                await fs.writeFile(filePath, response.data);
                localAssets.push({
                    ...asset,
                    localPath: filePath
                });
            } catch (error) {
                console.error(`Failed to download asset ${i}:`, error.message);
            }
        }
        
        return localAssets;
    }

    async createFFmpegScript(audioPath, assets, duration) {
        // Create FFmpeg command for professional video compilation
        let filterComplex = '';
        let inputs = `-i "${audioPath}" `;
        
        // Add asset inputs
        assets.forEach((asset, index) => {
            inputs += `-i "${asset.localPath}" `;
        });

        // Create video timeline with transitions
        let timeline = '';
        let currentTime = 0;
        const segmentDuration = duration / assets.length;

        assets.forEach((asset, index) => {
            if (asset.type === 'video') {
                timeline += `[${index + 1}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.5,fade=t=out:st=${segmentDuration-0.5}:d=0.5[v${index}];`;
            } else {
                timeline += `[${index + 1}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,loop=loop=-1:size=1,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.5,fade=t=out:st=${asset.duration-0.5}:d=0.5[v${index}];`;
            }
        });

        // Concatenate all video segments
        const videoInputs = assets.map((_, index) => `[v${index}]`).join('');
        timeline += `${videoInputs}concat=n=${assets.length}:v=1:a=0[outv]`;

        filterComplex = `-filter_complex "${timeline}"`;

        return `ffmpeg ${inputs} ${filterComplex} -map "[outv]" -map 0:a -c:v libx264 -c:a aac -preset fast -crf 23 -r 30 OUTPUT_PATH`;
    }

    async addHollywoodEffects(videoPath, visualStyle) {
        console.log('✨ Adding Hollywood-style effects...');
        
        const effectsMap = {
            'corporate': 'clean transitions, subtle color grading',
            'modern': 'dynamic transitions, vibrant colors',
            'minimalist': 'smooth fades, neutral tones',
            'cinematic': 'dramatic transitions, film-like color grading'
        };

        try {
            const outputPath = path.join(this.outputDir, `final_${Date.now()}.mp4`);
            
            // Apply color grading and effects based on style
            let effectsFilter = '';
            
            switch(visualStyle) {
                case 'cinematic':
                    effectsFilter = 'colorbalance=rs=0.1:gs=-0.1:bs=-0.2,curves=vintage';
                    break;
                case 'modern':
                    effectsFilter = 'vibrance=intensity=0.3,colorbalance=rs=0.05:bs=-0.05';
                    break;
                case 'corporate':
                    effectsFilter = 'colorbalance=rs=-0.05:gs=0.05,curves=increase_contrast';
                    break;
                default:
                    effectsFilter = 'colorbalance=rs=0:gs=0:bs=0';
            }

            const command = `ffmpeg -i "${videoPath}" -vf "${effectsFilter}" -c:v libx264 -c:a copy -preset medium -crf 21 "${outputPath}"`;
            
            execSync(command, { stdio: 'inherit' });
            
            console.log('✅ Hollywood effects applied successfully');
            return outputPath;
            
        } catch (error) {
            console.error('Effects application failed:', error);
            // Return original video if effects fail
            return videoPath;
        }
    }

    getPlaceholderAssets(category) {
        // Fallback assets if APIs fail
        return [
            { type: 'image', localPath: './assets/placeholder1.jpg', duration: 5 },
            { type: 'image', localPath: './assets/placeholder2.jpg', duration: 5 },
            { type: 'image', localPath: './assets/placeholder3.jpg', duration: 5 }
        ];
    }
}

// Integration with your existing backend
async function generateVideoWithAlternativeMethod(videoRequest, apiKeys) {
    const generator = new AlternativeVideoGenerator(apiKeys);
    
    try {
        const result = await generator.generateVideo(videoRequest);
        
        return {
            success: true,
            videoUrl: result.videoPath,
            script: result.script,
            processingTime: Date.now() - startTime,
            method: 'alternative_stock_media',
            quality: 'professional'
        };
        
    } catch (error) {
        console.error('Alternative video generation failed:', error);
        return {
            success: false,
            error: error.message,
            method: 'alternative_stock_media'
        };
    }
}

module.exports = { AlternativeVideoGenerator, generateVideoWithAlternativeMethod };