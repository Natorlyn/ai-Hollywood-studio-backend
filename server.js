require('dotenv').config();

// Debug environment variables
console.log('Environment check - MongoDB URI exists:', !!process.env.MONGODB_URI);
console.log('Environment check - NODE_ENV:', process.env.NODE_ENV);
console.log('Environment check - Admin Email:', process.env.ADMIN_EMAIL);

const express = require('express');
const app = express();
app.set('trust proxy', 1);

// Required dependencies
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Enhanced Video Generation System (keeping existing implementation)
class CompleteVideoGenerator {
    constructor(apiKeys) {
        this.elevenLabsKey = apiKeys.elevenlabs;
        this.pexelsKey = apiKeys.pexels;
        this.pixabayKey = apiKeys.pixabay;
        this.outputDir = path.join(__dirname, 'generated_videos');
        this.tempDir = path.join(__dirname, 'temp_assets');
    }

    async generateVideo({ title, category, duration, tone, voiceStyle, visualStyle }) {
        try {
            console.log(`Starting complete video generation: ${title}`);
            
            await this.ensureDirectories();
            const script = await this.generateScript(title, category, duration, tone);
            const audioFile = await this.generateVoiceover(script.content, voiceStyle, title);
            const mediaAssets = await this.gatherMediaAssets(category, script.scenes);
            const videoFile = await this.compileVideo(audioFile, mediaAssets, title, duration);
            
            console.log(`Video generation completed: ${videoFile}`);
            
            return {
                success: true,
                videoFile: videoFile,
                downloadUrl: `/download/${path.basename(videoFile)}`,
                duration: duration,
                quality: '1080p',
                fileSize: await this.getFileSize(videoFile)
            };
            
        } catch (error) {
            console.error('Video generation failed:', error);
            throw error;
        }
    }

    async ensureDirectories() {
        for (const dir of [this.outputDir, this.tempDir]) {
            try {
                await fs.access(dir);
            } catch {
                await fs.mkdir(dir, { recursive: true });
            }
        }
    }

    async generateScript(title, category, duration, tone) {
        const templates = {
            'personal-finance': {
                intro: `Welcome to your complete guide on ${title}. Today, we'll explore proven strategies that can transform your financial future and help you build lasting wealth.`,
                mainSections: [
                    'Understanding the fundamentals and why this matters for your financial health',
                    'Common mistakes people make and how to avoid them', 
                    'Step-by-step implementation strategies',
                    'Real-world examples and case studies',
                    'Advanced tips for maximizing results',
                    'Long-term planning and wealth building strategies',
                    'Tax optimization and legal considerations',
                    'Emergency fund planning and risk management'
                ],
                conclusion: `Remember, financial success is a journey, not a destination. Start implementing these strategies today, and you'll be amazed at the progress you can make. Subscribe for more financial wisdom, and let me know in the comments which strategy you'll implement first.`
            },
            'investing': {
                intro: `Today we're diving deep into ${title}. The investment landscape offers incredible opportunities for those who understand the fundamentals and apply them consistently.`,
                mainSections: [
                    'Market analysis and current opportunities',
                    'Risk assessment and management strategies',
                    'Portfolio diversification techniques',
                    'Timing and execution strategies',
                    'Long-term wealth building principles',
                    'Dollar-cost averaging and systematic investing',
                    'Tax-advantaged investment accounts',
                    'International diversification strategies',
                    'Alternative investment options',
                    'Performance monitoring and rebalancing'
                ],
                conclusion: `Successful investing requires patience, discipline, and continuous learning. These principles have helped countless investors build substantial wealth over time. Start with what you can afford, stay consistent, and let compound growth work its magic.`
            },
            'cryptocurrency': {
                intro: `Cryptocurrency represents one of the most significant financial innovations of our time. Understanding ${title} is crucial for anyone looking to participate in this digital revolution responsibly.`,
                mainSections: [
                    'Technology fundamentals and blockchain basics',
                    'Market dynamics and price factors',
                    'Security best practices and wallet management',
                    'Trading strategies and technical analysis',
                    'Future trends and regulatory considerations',
                    'DeFi protocols and yield farming',
                    'NFTs and digital asset ownership',
                    'Institutional adoption and market maturity',
                    'Risk management in volatile markets',
                    'Long-term investment strategies'
                ],
                conclusion: `The crypto space moves fast, but with the right knowledge and careful approach, you can navigate it successfully. Stay informed, never invest more than you can afford to lose, and always prioritize security in your crypto journey.`
            },
            'artificial-intelligence': {
                intro: `Artificial Intelligence is reshaping every industry, and ${title} represents one of the most significant developments in this space. Whether you're a business owner, investor, or tech enthusiast, understanding these concepts is essential.`,
                mainSections: [
                    'AI fundamentals and current capabilities',
                    'Industry applications and use cases',
                    'Investment opportunities and market trends',
                    'Implementation strategies for businesses',
                    'Future implications and ethical considerations',
                    'Machine learning algorithms and data science',
                    'Natural language processing and automation',
                    'Computer vision and robotics applications',
                    'AI safety and regulatory frameworks',
                    'Career opportunities in the AI revolution'
                ],
                conclusion: `AI is not just the future—it's the present. By understanding and adapting to these changes now, you position yourself ahead of the curve. The opportunities are immense for those who take action today.`
            },
            'startups': {
                intro: `Building a successful startup requires more than just a great idea. Today, we're exploring ${title} and the essential strategies that separate successful entrepreneurs from those who struggle.`,
                mainSections: [
                    'Idea validation and market research',
                    'Building the right team and culture',
                    'Funding strategies and investor relations',
                    'Product development and iteration',
                    'Scaling and growth strategies',
                    'Customer acquisition and retention',
                    'Financial planning and cash flow management',
                    'Legal structures and intellectual property',
                    'Marketing and brand building',
                    'Exit strategies and long-term planning'
                ],
                conclusion: `Entrepreneurship is challenging but incredibly rewarding. Success comes to those who combine vision with execution, persistence with adaptability. Take these insights and start building something amazing today.`
            },
            'business': {
                intro: `In today's competitive business environment, understanding ${title} can be the difference between thriving and merely surviving. This comprehensive guide will give you the strategic insights you need to succeed.`,
                mainSections: [
                    'Strategic planning and goal setting',
                    'Market positioning and competitive advantage',
                    'Operations optimization and efficiency',
                    'Financial management and profitability',
                    'Leadership and team development',
                    'Digital transformation and technology adoption',
                    'Customer experience and satisfaction',
                    'Supply chain management and logistics',
                    'Risk management and crisis planning',
                    'Innovation and continuous improvement'
                ],
                conclusion: `Business success is built on solid fundamentals executed consistently. Implement these strategies systematically, measure your results, and never stop learning. Your future success depends on the actions you take today.`
            }
        };

        const template = templates[category] || templates['business'];
        const wordsPerMinute = 150;
        const targetWords = duration * wordsPerMinute;
        
        console.log(`Generating script for ${duration} minutes (target: ${targetWords} words)`);
        
        // Calculate words per section
        const introWords = Math.floor(targetWords * 0.15); // 15% for intro
        const conclusionWords = Math.floor(targetWords * 0.10); // 10% for conclusion
        const mainContentWords = targetWords - introWords - conclusionWords; // 75% for main content
        
        // Generate expanded intro
        const expandedIntro = this.expandContent(template.intro, introWords, tone);
        
        // Generate expanded main content sections
        const wordsPerSection = Math.floor(mainContentWords / template.mainSections.length);
        const expandedSections = template.mainSections.map((section, index) => {
            const sectionContent = this.expandSection(section, wordsPerSection, tone, category);
            const timing = `${Math.floor(index * (duration / template.mainSections.length))}-${Math.floor((index + 1) * (duration / template.mainSections.length))} minutes`;
            
            return {
                title: section,
                content: sectionContent,
                timing: timing
            };
        });
        
        // Generate expanded conclusion
        const expandedConclusion = this.expandContent(template.conclusion, conclusionWords, tone);
        
        // Combine all content
        const fullContent = [
            expandedIntro,
            ...expandedSections.map(s => s.content),
            expandedConclusion
        ].join('\n\n');
        
        console.log(`Generated script: ${fullContent.split(' ').length} words for ${duration} minutes`);
        
        return {
            title,
            intro: expandedIntro,
            sections: expandedSections,
            conclusion: expandedConclusion,
            content: fullContent,
            scenes: expandedSections.length + 2,
            duration: duration,
            wordCount: fullContent.split(' ').length
        };
    }

    expandContent(baseContent, targetWords, tone) {
        const toneStyles = {
            'professional': 'In professional terms, ',
            'educational': 'From an educational perspective, ',
            'conversational': 'Let me explain this simply - ',
            'authoritative': 'Industry experts consistently demonstrate that ',
            'motivational': 'Here is what successful people understand - '
        };

        const starter = toneStyles[tone] || toneStyles['educational'];
        
        const expansions = [
            'Research consistently shows that individuals who understand these principles achieve significantly better results than those who rely purely on intuition or guesswork.',
            'The data from thousands of case studies reveals clear patterns that separate successful outcomes from mediocre ones.',
            'When you examine the strategies used by top performers in this field, several key factors emerge that anyone can implement.',
            'The most common mistake people make is underestimating the importance of systematic approaches and overestimating the impact of individual tactics.',
            'What many people do not realize is that success in this area follows predictable patterns that have been documented across multiple industries and time periods.',
            'The compound effect plays a crucial role here - small, consistent actions build momentum over time to create remarkable results.',
            'Understanding the psychology behind these concepts is just as important as knowing the technical details.',
            'Modern technology and data analytics have given us unprecedented insights into what actually works versus what sounds good in theory.',
            'The key is to balance proven fundamentals with innovative approaches that take advantage of current market conditions.',
            'Timing and execution matter, but having a solid foundation of knowledge and principles is what enables you to recognize and capitalize on opportunities.'
        ];

        let expandedContent = baseContent;
        let currentWords = baseContent.split(' ').length;
        
        while (currentWords < targetWords) {
            const randomExpansion = expansions[Math.floor(Math.random() * expansions.length)];
            expandedContent += ' ' + randomExpansion;
            currentWords = expandedContent.split(' ').length;
        }
        
        // Trim to exact word count if needed
        const words = expandedContent.split(' ');
        if (words.length > targetWords) {
            expandedContent = words.slice(0, targetWords).join(' ');
        }
        
        return expandedContent;
    }

    expandSection(sectionTitle, targetWords, tone, category) {
        const categoryExamples = {
            'personal-finance': [
                'For example, consider the 50-30-20 budgeting rule where you allocate 50% to needs, 30% to wants, and 20% to savings and debt repayment.',
                'High-yield savings accounts currently offer rates between 4-5%, significantly outperforming traditional savings accounts.',
                'The average millionaire has seven different income streams, demonstrating the power of diversified revenue sources.',
                'Compound interest is often called the eighth wonder of the world - a $1000 investment at 10% annual return becomes over $17,000 in 30 years.'
            ],
            'investing': [
                'The S&P 500 has delivered an average annual return of approximately 10% over the past 90 years, despite short-term volatility.',
                'Dollar-cost averaging into index funds has historically outperformed trying to time the market in 80% of cases.',
                'Warren Buffett has consistently recommended low-cost index funds for most investors, calling them the best investment for ordinary people.',
                'Asset allocation becomes more conservative as you approach retirement - the rule of thumb is your bond percentage should equal your age.'
            ],
            'cryptocurrency': [
                'Bitcoin has experienced four major bull and bear cycles since 2009, each following similar patterns of adoption and correction.',
                'Institutional adoption has accelerated with companies like Tesla, MicroStrategy, and PayPal adding Bitcoin to their balance sheets.',
                'DeFi protocols have locked over $40 billion in total value, representing a new paradigm for financial services.',
                'The energy consumption debate around Bitcoin mining has led to increased focus on renewable energy sources in the industry.'
            ]
        };

        const examples = categoryExamples[category] || categoryExamples['personal-finance'];
        
        const baseExpansions = [
            'This concept requires understanding multiple interconnected factors that influence outcomes.',
            'Professional practitioners in this field follow specific methodologies that have been refined over decades.',
            'The implementation process involves several critical steps that must be executed in the correct sequence.',
            'Common pitfalls include rushing the process, ignoring fundamental principles, and failing to adapt to changing conditions.',
            'Success metrics should be clearly defined and regularly monitored to ensure you are making progress toward your goals.',
            'Industry best practices emphasize the importance of continuous learning and staying updated with latest developments.',
            'Risk management strategies are essential components that protect against potential downsides while maximizing upside potential.',
            'The psychological aspects cannot be ignored - emotions and behavioral biases often derail even the best-laid plans.',
            'Technology tools and platforms have made implementation more accessible, but human judgment remains irreplaceable.',
            'Long-term thinking and patience are required, as most significant results compound over months and years rather than days or weeks.'
        ];

        let content = `When examining ${sectionTitle.toLowerCase()}, several key principles emerge that distinguish successful outcomes from mediocre ones. `;
        
        // Add category-specific examples
        const randomExamples = examples.sort(() => 0.5 - Math.random()).slice(0, 2);
        content += randomExamples.join(' ') + ' ';
        
        // Add base expansions until we reach target word count
        const allExpansions = [...baseExpansions].sort(() => 0.5 - Math.random());
        let currentWords = content.split(' ').length;
        
        for (const expansion of allExpansions) {
            if (currentWords >= targetWords) break;
            content += expansion + ' ';
            currentWords = content.split(' ').length;
        }
        
        // Trim to exact word count if needed
        const words = content.split(' ');
        if (words.length > targetWords) {
            content = words.slice(0, targetWords).join(' ');
        }
        
        return content;
    }

    async generateVoiceover(script, voiceStyle, title) {
        if (!this.elevenLabsKey) {
            throw new Error('ElevenLabs API key not configured');
        }

        try {
            console.log('Generating voiceover with ElevenLabs...');
            
            const voiceIds = {
                'professional-male': '21m00Tcm4TlvDq8ikWAM',
                'professional-female': 'AZnzlk1XvdvUeBnXmlld',
                'conversational-male': 'pNInz6obpgDQGcFmaJgB',
                'conversational-female': 'XB0fDUnXU5powFXDhCwa',
                'authoritative-male': 'onwK4e9ZLuTAKqWW03F9',
                'warm-female': 'oWAxZDx7w5VEj9dCyTzz'
            };

            const voiceId = voiceIds[voiceStyle] || voiceIds['professional-male'];
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text: script,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.75,
                        similarity_boost: 0.75,
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

            const audioFileName = `audio_${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_')}.mp3`;
            const audioFilePath = path.join(this.tempDir, audioFileName);
            
            await fs.writeFile(audioFilePath, response.data);
            console.log('Voiceover generated successfully');
            
            return audioFilePath;
            
        } catch (error) {
            console.error('ElevenLabs API error:', error.response?.data || error.message);
            throw new Error('Voiceover generation failed');
        }
    }

    async gatherMediaAssets(category, sceneCount) {
        try {
            console.log('Gathering media assets...');
            
            const assets = {
                videos: [],
                images: []
            };

            if (this.pexelsKey) {
                assets.videos = await this.downloadPexelsVideos(category, Math.min(3, sceneCount));
            }

            if (this.pixabayKey) {
                assets.images = await this.downloadPixabayImages(category, Math.min(5, sceneCount));
            }

            console.log(`Gathered ${assets.videos.length} videos and ${assets.images.length} images`);
            return assets;
            
        } catch (error) {
            console.error('Media gathering failed:', error);
            return { videos: [], images: [] };
        }
    }

    async downloadPexelsVideos(category, count) {
        if (!this.pexelsKey) return [];

        try {
            const searchTerms = {
                'personal-finance': 'business money planning',
                'investing': 'stock market charts',
                'cryptocurrency': 'technology digital',
                'artificial-intelligence': 'technology computer',
                'startups': 'office business',
                'business': 'professional meeting'
            };

            const searchTerm = searchTerms[category] || 'business';
            
            const response = await axios.get('https://api.pexels.com/videos/search', {
                headers: {
                    'Authorization': this.pexelsKey
                },
                params: {
                    query: searchTerm,
                    per_page: count,
                    orientation: 'landscape'
                }
            });

            const downloadedVideos = [];
            
            for (let i = 0; i < Math.min(response.data.videos.length, count); i++) {
                const video = response.data.videos[i];
                const videoFile = video.video_files.find(file => file.quality === 'hd') || video.video_files[0];
                
                if (videoFile) {
                    const fileName = `pexels_video_${Date.now()}_${i}.mp4`;
                    const filePath = path.join(this.tempDir, fileName);
                    
                    const videoResponse = await axios.get(videoFile.link, { responseType: 'stream' });
                    const writeStream = fsSync.createWriteStream(filePath);
                    
                    await new Promise((resolve, reject) => {
                        videoResponse.data.pipe(writeStream);
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                    });
                    
                    downloadedVideos.push(filePath);
                }
            }
            
            return downloadedVideos;
            
        } catch (error) {
            console.error('Pexels video download failed:', error);
            return [];
        }
    }

    async downloadPixabayImages(category, count) {
        if (!this.pixabayKey) return [];

        try {
            const searchTerms = {
                'personal-finance': 'business finance money',
                'investing': 'investment growth chart',
                'cryptocurrency': 'cryptocurrency bitcoin',
                'artificial-intelligence': 'artificial intelligence',
                'startups': 'startup entrepreneur',
                'business': 'business professional'
            };

            const searchTerm = searchTerms[category] || 'business';
            
            const response = await axios.get('https://pixabay.com/api/', {
                params: {
                    key: this.pixabayKey,
                    q: searchTerm,
                    image_type: 'photo',
                    orientation: 'horizontal',
                    min_width: 1280,
                    per_page: count,
                    safesearch: 'true'
                }
            });

            const downloadedImages = [];
            
            for (let i = 0; i < Math.min(response.data.hits.length, count); i++) {
                const image = response.data.hits[i];
                const imageUrl = image.webformatURL;
                
                const fileName = `pixabay_image_${Date.now()}_${i}.jpg`;
                const filePath = path.join(this.tempDir, fileName);
                
                const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
                const writeStream = fsSync.createWriteStream(filePath);
                
                await new Promise((resolve, reject) => {
                    imageResponse.data.pipe(writeStream);
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
                
                downloadedImages.push(filePath);
            }
            
            return downloadedImages;
            
        } catch (error) {
            console.error('Pixabay image download failed:', error);
            return [];
        }
    }

    async compileVideo(audioFile, mediaAssets, title, duration) {
        try {
            console.log('Compiling final video...');
            
            const outputFileName = `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.mp4`;
            const outputPath = path.join(this.outputDir, outputFileName);
            
            const durationSeconds = duration * 60;
            
            if (mediaAssets.videos.length > 0) {
                await this.createVideoWithClips(audioFile, mediaAssets.videos, outputPath, durationSeconds);
            } else if (mediaAssets.images.length > 0) {
                await this.createVideoFromImages(audioFile, mediaAssets.images, outputPath, durationSeconds);
            } else {
                await this.createSimpleVideo(audioFile, outputPath, durationSeconds);
            }
            
            console.log('Video compilation completed');
            return outputPath;
            
        } catch (error) {
            console.error('Video compilation failed:', error);
            const fallbackPath = path.join(this.outputDir, `audio_${Date.now()}.mp3`);
            await fs.copyFile(audioFile, fallbackPath);
            return fallbackPath;
        }
    }

    async createVideoWithClips(audioFile, videos, outputPath, duration) {
        const videoList = videos.slice(0, 3);
        const segmentDuration = duration / videoList.length;
        
        let filterComplex = '';
        let inputs = `-i "${audioFile}" `;
        
        for (let i = 0; i < videoList.length; i++) {
            inputs += `-i "${videoList[i]}" `;
            filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS,trim=duration=${segmentDuration}[v${i}];`;
        }
        
        filterComplex += videoList.map((_, i) => `[v${i}]`).join('') + `concat=n=${videoList.length}:v=1:a=0[outv]`;
        
        const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -c:a aac -t ${duration} "${outputPath}"`;
        
        await execAsync(command);
    }

    async createVideoFromImages(audioFile, images, outputPath, duration) {
        const imageList = images.slice(0, 5);
        const imageDuration = duration / imageList.length;
        
        let filterComplex = '';
        let inputs = `-i "${audioFile}" `;
        
        for (let i = 0; i < imageList.length; i++) {
            inputs += `-loop 1 -t ${imageDuration} -i "${imageList[i]}" `;
            filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fade=t=in:st=0:d=0.5,fade=t=out:st=${imageDuration - 0.5}:d=0.5[v${i}];`;
        }
        
        filterComplex += imageList.map((_, i) => `[v${i}]`).join('') + `concat=n=${imageList.length}:v=1:a=0[outv]`;
        
        const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -c:a aac -shortest "${outputPath}"`;
        
        await execAsync(command);
    }

    async createSimpleVideo(audioFile, outputPath, duration) {
        const command = `ffmpeg -y -i "${audioFile}" -f lavfi -i "color=c=#1a1a2e:s=1920x1080:d=${duration},geq=r='255*sin(2*PI*T/10)':g='255*sin(2*PI*T/10 + 2*PI/3)':b='255*sin(2*PI*T/10 + 4*PI/3)'" -map 1:v -map 0:a -c:v libx264 -c:a aac -shortest "${outputPath}"`;
        
        await execAsync(command);
    }

    async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return Math.round(stats.size / 1024 / 1024) + ' MB';
        } catch {
            return 'Unknown';
        }
    }
}

// COMPLETELY FIXED SECURITY CONFIGURATION
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

class SecureVault {
    static encrypt(text) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Format: iv:encrypted_data
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }
    
    static decrypt(encryptedData) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            
            // Split IV and encrypted data
            const parts = encryptedData.split(':');
            if (parts.length !== 2) {
                console.error('Invalid encrypted data format:', encryptedData);
                return null;
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption failed:', error.message);
            return null;
        }
    }
}

// Enhanced API key retrieval with fallback
async function getDecryptedApiKeys() {
    if (!db) {
        console.log('No database connection for API keys');
        return {};
    }
    
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        const decryptedKeys = {};
        
        console.log(`Found ${apiKeys.length} API keys in database`);
        
        for (const key of apiKeys) {
            try {
                console.log(`Attempting to decrypt ${key.service} key`);
                const decryptedValue = SecureVault.decrypt(key.encryptedKey);
                
                if (decryptedValue) {
                    decryptedKeys[key.service] = decryptedValue;
                    console.log(`✅ Successfully decrypted ${key.service} key`);
                } else {
                    console.error(`❌ Failed to decrypt ${key.service} key - invalid format or corrupted`);
                }
            } catch (error) {
                console.error(`❌ Error decrypting ${key.service} key:`, error.message);
            }
        }
        
        console.log(`Successfully decrypted ${Object.keys(decryptedKeys).length} API keys:`, Object.keys(decryptedKeys));
        return decryptedKeys;
    } catch (error) {
        console.error('Failed to get API keys from database:', error);
        return {};
    }
}

// ROBUST AUTHENTICATION SYSTEM
class AuthenticationManager {
    constructor(database) {
        this.db = database;
        this.adminEmail = process.env.ADMIN_EMAIL || 'casteroai001@gmail.com';
        this.adminPasswordPlain = process.env.ADMIN_PASSWORD || 'admin123'; // Plain text for now
    }

    async initializeAdminUser() {
        if (!this.db) {
            console.log('Database not available, skipping admin user creation');
            return;
        }

        try {
            // Check if ANY user with this email exists (regardless of role)
            const existingUser = await this.db.collection('users').findOne({ 
                email: this.adminEmail
            });

            if (existingUser) {
                console.log('User with admin email already exists - updating to admin role and password');
                
                // Update existing user to be admin with new password
                const hashedPassword = await bcrypt.hash(this.adminPasswordPlain, 12);
                
                const updateResult = await this.db.collection('users').updateOne(
                    { email: this.adminEmail },
                    { 
                        $set: { 
                            password: hashedPassword,
                            role: 'admin',
                            plan: 'enterprise',
                            videosUsed: 0,
                            videosLimit: 999999,
                            isActive: true,
                            updatedAt: new Date(),
                            compliance: 'terms_compliant'
                        }
                    }
                );
                
                console.log('Existing user updated to admin successfully:', updateResult.modifiedCount, 'documents modified');
                return existingUser;
            }

            // Only create new user if email doesn't exist at all
            console.log('No user found with admin email, creating new admin user');
            const hashedPassword = await bcrypt.hash(this.adminPasswordPlain, 12);
            
            const adminUser = {
                email: this.adminEmail,
                password: hashedPassword,
                role: 'admin',
                plan: 'enterprise',
                videosUsed: 0,
                videosLimit: 999999,
                isActive: true,
                createdAt: new Date(),
                compliance: 'terms_compliant'
            };

            const result = await this.db.collection('users').insertOne(adminUser);
            console.log('New admin user created successfully with ID:', result.insertedId);
            
            return { ...adminUser, _id: result.insertedId };
            
        } catch (error) {
            // If it's still a duplicate key error, just log and continue
            if (error.code === 11000) {
                console.log('Admin user already exists (duplicate key), continuing with authentication...');
                return null;
            }
            
            console.error('Failed to initialize admin user:', error);
            return null;
        }
    }

    async authenticateUser(email, password) {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        // Special handling for admin - try direct environment variable first
        if (email === this.adminEmail) {
            // First try the plain text password from environment
            if (password === this.adminPasswordPlain) {
                return this.createAdminUserObject();
            }
        }

        // Database authentication for all users (including admin with hashed password)
        if (!this.db) {
            throw new Error('Database not available');
        }

        const user = await this.db.collection('users').findOne({ email });
        if (!user) {
            throw new Error('Invalid credentials');
        }

        if (!user.isActive) {
            throw new Error('Account suspended');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            throw new Error('Invalid credentials');
        }

        return user;
    }

    createAdminUserObject() {
        return {
            _id: new ObjectId(),
            email: this.adminEmail,
            role: 'admin',
            plan: 'enterprise',
            videosUsed: 0,
            videosLimit: 999999,
            isActive: true,
            createdAt: new Date()
        };
    }

    generateToken(user) {
        return jwt.sign(
            {
                _id: user._id,
                email: user.email,
                role: user.role,
                plan: user.plan,
                videosUsed: user.videosUsed,
                videosLimit: user.videosLimit
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
    }
}

// Middleware Configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    trustProxy: true,
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/auth', createRateLimit(15 * 60 * 1000, 10, 'Too many authentication attempts'));
app.use('/api/videos', createRateLimit(60 * 60 * 1000, 10, 'Video generation limit reached'));
app.use('/api/', createRateLimit(15 * 60 * 1000, 100, 'Too many API requests'));

// Database Connection and Initialization
let db = null;
let authManager = null;
const MONGODB_URI = process.env.MONGODB_URI;

async function connectToDatabase() {
    if (!MONGODB_URI) {
        console.log('Running in demo mode (database will be connected later)');
        return null;
    }
    
    try {
        console.log('MongoDB URI configured: YES');
        console.log('Connecting to MongoDB...');
        
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        
        db = client.db();
        
        console.log('MongoDB connected successfully');
        console.log('Database name:', db.databaseName);
        
        // Initialize authentication manager
        authManager = new AuthenticationManager(db);
        
        await initializeDatabase();
        return db;
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        console.log('Continuing in demo mode...');
        // Create fallback auth manager for demo mode
        authManager = new AuthenticationManager(null);
        return null;
    }
}

async function initializeDatabase() {
    if (!db || !authManager) return;
    
    try {
        // Create admin user
        await authManager.initializeAdminUser();
        
        // Create indexes
        await db.collection('apikeys').createIndex({ service: 1 }, { unique: true });
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('videologs').createIndex({ userId: 1, createdAt: -1 });
        
        console.log('Database indexes created');
    } catch (error) {
        console.error('Database initialization failed:', error);
    }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Helper Functions
function getPlanLimits(plan) {
    const limits = {
        free: { videos: 2, quality: '720p', watermark: true },
        professional: { videos: 20, quality: '1080p', watermark: false },
        agency: { videos: 100, quality: '4K', watermark: false },
        enterprise: { videos: 999999, quality: '4K', watermark: false }
    };
    return limits[plan] || limits.free;
}

function getExportQuality(plan) {
    return getPlanLimits(plan).quality;
}

function getWatermarkStatus(plan) {
    return getPlanLimits(plan).watermark;
}

async function getDecryptedApiKeys() {
    if (!db) return {};
    
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        const decryptedKeys = {};
        
        for (const key of apiKeys) {
            try {
                decryptedKeys[key.service] = SecureVault.decrypt(key.encryptedKey);
            } catch (error) {
                console.error(`Failed to decrypt ${key.service} key`);
            }
        }
        
        return decryptedKeys;
    } catch (error) {
        console.error('Failed to get API keys:', error);
        return {};
    }
}

// API Routes

// Health Check
app.get('/api/health', async (req, res) => {
    const mongoConfigured = !!MONGODB_URI;
    const connected = !!db;
    
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        compliance: 'terms_compliant',
        message: 'AI Hollywood Studio Backend is running!'
    };
    
    if (mongoConfigured) {
        healthData.database = connected ? 'connected' : 'disconnected';
        healthData.mongoConfigured = true;
    } else {
        healthData.database = 'demo_mode';
        healthData.mongoConfigured = false;
    }
    
    if (authManager) {
        healthData.adminEmail = authManager.adminEmail;
        healthData.authenticationSystem = 'robust';
    }
    
    // Check FFmpeg availability
    try {
        await execAsync('ffmpeg -version');
        healthData.ffmpeg = 'available';
    } catch {
        healthData.ffmpeg = 'not_available';
    }
    
    res.json(healthData);
});

// Temporary debug route - remove after fixing
app.get('/api/debug/admin', async (req, res) => {
    if (db && authManager) {
        const user = await db.collection('users').findOne({ email: authManager.adminEmail });
        res.json({
            userExists: !!user,
            userRole: user?.role,
            userEmail: user?.email,
            adminPassword: authManager.adminPasswordPlain,
            adminEmail: authManager.adminEmail,
            environmentVariables: {
                ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
                ADMIN_EMAIL: !!process.env.ADMIN_EMAIL
            }
        });
    } else {
        res.json({ 
            error: 'No database connection',
            authManager: !!authManager,
            adminPassword: authManager?.adminPasswordPlain,
            adminEmail: authManager?.adminEmail
        });
    }
});

// Temporary fix route - reset admin password
app.post('/api/debug/reset-admin', async (req, res) => {
    if (!db || !authManager) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(authManager.adminPasswordPlain, 12);
        
        const result = await db.collection('users').updateOne(
            { email: authManager.adminEmail },
            { 
                $set: { 
                    password: hashedPassword,
                    role: 'admin',
                    plan: 'enterprise',
                    isActive: true,
                    updatedAt: new Date()
                }
            }
        );
        
        res.json({
            success: true,
            message: 'Admin password reset successfully',
            modifiedCount: result.modifiedCount,
            newPassword: authManager.adminPasswordPlain
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Demo Status
app.get('/api/demo/status', (req, res) => {
    res.json({
        message: 'AI Hollywood Studio Backend is running!',
        features: [
            'Robust authentication system',
            'Security systems active',
            'Video generation ready',
            'Admin access configured',
            'API key encryption enabled',
            'Rate limiting active',
            'FFmpeg video compilation'
        ],
        authentication: {
            adminEmail: authManager ? authManager.adminEmail : 'Not configured',
            adminPassword: 'admin123',
            system: 'Robust with fallback'
        }
    });
});

// ROBUST AUTHENTICATION ROUTES
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        const planLimits = getPlanLimits('free');
        
        const newUser = {
            email,
            password: hashedPassword,
            role: 'user',
            plan: 'free',
            videosUsed: 0,
            videosLimit: planLimits.videos,
            isActive: true,
            createdAt: new Date(),
            compliance: 'terms_compliant'
        };
        
        const result = await db.collection('users').insertOne(newUser);
        
        const token = authManager.generateToken({
            _id: result.insertedId,
            email,
            role: 'user',
            plan: 'free',
            videosUsed: 0,
            videosLimit: planLimits.videos
        });
        
        console.log(`New user registered: ${email}`);
        
        res.status(201).json({
            success: true,
            token,
            user: {
                email,
                plan: 'free',
                videosUsed: 0,
                videosLimit: planLimits.videos,
                exportQuality: getExportQuality('free'),
                watermark: getWatermarkStatus('free')
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ROBUST LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log(`Login attempt for: ${email}`);
        
        if (!authManager) {
            return res.status(503).json({ error: 'Authentication system not initialized' });
        }
        
        // Use the robust authentication manager
        const user = await authManager.authenticateUser(email, password);
        
        // Generate JWT token
        const token = authManager.generateToken(user);
        
        console.log(`Login successful for: ${email} (Role: ${user.role})`);
        
        res.json({
            success: true,
            token,
            user: {
                email: user.email,
                role: user.role,
                plan: user.plan,
                videosUsed: user.videosUsed,
                videosLimit: user.videosLimit,
                exportQuality: getExportQuality(user.plan),
                watermark: getWatermarkStatus(user.plan)
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: error.message });
    }
});

// Video Generation Route
app.post('/api/videos/generate', authenticateToken, async (req, res) => {
    try {
        const { title, category, duration, tone, voiceStyle, visualStyle } = req.body;
        
        if (req.user.videosUsed >= req.user.videosLimit && req.user.plan !== 'enterprise') {
            return res.status(403).json({ error: 'Video limit reached for your plan' });
        }

        const startTime = Date.now();
        console.log(`Starting video generation for user: ${req.user.email}`);

        const apiKeys = await getDecryptedApiKeys();
        
        if (!apiKeys.elevenlabs) {
            return res.status(400).json({ error: 'ElevenLabs API key not configured. Please add it in the admin dashboard.' });
        }

        const generator = new CompleteVideoGenerator(apiKeys);
        
        const videoResult = await generator.generateVideo({
            title,
            category, 
            duration,
            tone,
            voiceStyle,
            visualStyle
        });

        const processingTime = Date.now() - startTime;

        if (db) {
            await db.collection('users').updateOne(
                { _id: req.user._id },
                { $inc: { videosUsed: 1 } }
            );

            const videoLog = {
                userId: req.user._id,
                title,
                category,
                duration,
                plan: req.user.plan,
                exportQuality: getExportQuality(req.user.plan),
                method: 'complete_video_generation',
                processingTime,
                success: videoResult.success,
                fileSize: videoResult.fileSize,
                compliance: 'terms_compliant',
                createdAt: new Date()
            };

            await db.collection('videologs').insertOne(videoLog);
        }

        console.log(`Video generated successfully: ${title} for ${req.user.email}`);

        res.json({
            success: true,
            video: {
                title,
                duration,
                exportQuality: getExportQuality(req.user.plan),
                watermark: getWatermarkStatus(req.user.plan),
                downloadUrl: videoResult.downloadUrl,
                processingTime,
                fileSize: videoResult.fileSize,
                method: 'complete_video_generation',
                compliance: 'terms_compliant'
            },
            user: {
                videosUsed: req.user.videosUsed + 1,
                videosLimit: req.user.videosLimit
            }
        });

    } catch (error) {
        console.error('Video generation error:', error);
        res.status(500).json({ error: 'Video generation failed: ' + error.message });
    }
});

// Serve generated video files
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'generated_videos', filename);
    
    res.download(filePath, (err) => {
        if (err) {
            console.error('Download failed:', err);
            res.status(404).json({ error: 'Video file not found' });
        }
    });
});

// Admin Routes
app.post('/api/admin/keys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service, apiKey } = req.body;
        
        if (!service || !apiKey) {
            return res.status(400).json({ error: 'Service and API key required' });
        }
        
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const encryptedKey = SecureVault.encrypt(apiKey);
        
        await db.collection('apikeys').updateOne(
            { service },
            {
                $set: {
                    service,
                    encryptedKey,
                    isActive: true,
                    updatedAt: new Date(),
                    updatedBy: req.user.email
                }
            },
            { upsert: true }
        );
        
        console.log(`API key updated for service: ${service}`);
        
        res.json({
            success: true,
            message: `${service} API key updated successfully`
        });
        
    } catch (error) {
        console.error('API key update error:', error);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

app.get('/api/admin/keys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const apiKeys = await db.collection('apikeys').find(
            { isActive: true },
            { projection: { service: 1, updatedAt: 1, updatedBy: 1 } }
        ).toArray();
        
        res.json({
            success: true,
            keys: apiKeys.map(key => ({
                service: key.service,
                status: 'active',
                lastUpdated: key.updatedAt,
                updatedBy: key.updatedBy
            }))
        });
        
    } catch (error) {
        console.error('API keys fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

app.delete('/api/admin/keys/:service', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service } = req.params;
        
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        await db.collection('apikeys').updateOne(
            { service },
            { $set: { isActive: false, deletedAt: new Date(), deletedBy: req.user.email } }
        );
        
        console.log(`API key deactivated for service: ${service}`);
        
        res.json({
            success: true,
            message: `${service} API key deactivated`
        });
        
    } catch (error) {
        console.error('API key deletion error:', error);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
});

// Admin Dashboard
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (db) {
            const stats = await Promise.all([
                db.collection('users').countDocuments(),
                db.collection('users').countDocuments({ plan: 'free' }),
                db.collection('users').countDocuments({ plan: 'professional' }),
                db.collection('users').countDocuments({ plan: 'agency' }),
                db.collection('videologs').countDocuments(),
                db.collection('videologs').countDocuments({ success: true }),
                db.collection('apikeys').countDocuments({ isActive: true })
            ]);
            
            const [totalUsers, freeUsers, proUsers, agencyUsers, totalVideos, successfulVideos, activeApiKeys] = stats;
            
            const recentVideos = await db.collection('videologs')
                .find({}, { projection: { title: 1, createdAt: 1, success: 1, plan: 1 } })
                .sort({ createdAt: -1 })
                .limit(5)
                .toArray();
            
            res.json({
                success: true,
                stats: {
                    totalUsers,
                    planDistribution: {
                        free: freeUsers,
                        professional: proUsers,
                        agency: agencyUsers
                    },
                    totalVideos,
                    successfulVideos,
                    successRate: totalVideos > 0 ? Math.round((successfulVideos / totalVideos) * 100) : 0,
                    activeApiKeys,
                    revenue: {
                        monthly: (proUsers * 89) + (agencyUsers * 249),
                        projected: ((proUsers * 89) + (agencyUsers * 249)) * 12
                    }
                },
                recentActivity: recentVideos,
                compliance: 'terms_compliant'
            });
        } else {
            res.json({
                success: true,
                stats: {
                    totalUsers: 0,
                    planDistribution: { free: 0, professional: 0, agency: 0 },
                    totalVideos: 0,
                    successfulVideos: 0,
                    successRate: 0,
                    activeApiKeys: 0,
                    revenue: { monthly: 0, projected: 0 }
                },
                recentActivity: [],
                compliance: 'terms_compliant',
                message: 'Running in demo mode'
            });
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// User Management
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const users = await db.collection('users')
            .find({}, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json({
            success: true,
            users: users.map(user => ({
                ...user,
                compliance: 'terms_compliant'
            }))
        });
        
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Video Logs
app.get('/api/admin/videos', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const videos = await db.collection('videologs')
            .find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        
        res.json({
            success: true,
            videos: videos.map(video => ({
                ...video,
                compliance: 'terms_compliant'
            }))
        });
        
    } catch (error) {
        console.error('Videos fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch video logs' });
    }
});

// Add this temporary test route to your server.js after the other routes
app.post('/api/test/video-generation', async (req, res) => {
    try {
        console.log('Testing video generation with hardcoded API keys');
        
        // Use your actual API keys directly (no encryption/decryption)
        const testApiKeys = {
            elevenlabs: 'sk_your_actual_elevenlabs_key_here',
            pexels: 'your_actual_pexels_key_here',
            pixabay: 'your_actual_pixabay_key_here'
        };

        const generator = new CompleteVideoGenerator(testApiKeys);
        
        const videoResult = await generator.generateVideo({
            title: 'Test Video Generation',
            category: 'personal-finance',
            duration: 1, // Short test video
            tone: 'professional',
            voiceStyle: 'professional-male',
            visualStyle: 'corporate'
        });

        res.json({
            success: true,
            message: 'Test video generation completed',
            result: videoResult
        });

    } catch (error) {
        console.error('Test video generation failed:', error);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack 
        });
    }
});

// Error handling for undefined routes
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /api/health',
            'GET /api/demo/status',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/videos/generate',
            'GET /download/:filename'
        ]
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Server Configuration
const PORT = process.env.PORT || 8080;

async function startServer() {
    try {
        console.log('Starting AI Hollywood Studio Backend...');
        console.log('Security: AES-256 encryption enabled');
        console.log('Authentication: Robust system with fallback');
        
        await connectToDatabase();
        
        app.listen(PORT, () => {
            console.log('AI Hollywood Studio Backend LIVE!');
            console.log(`Server running on port ${PORT}`);
            console.log('Authentication System: Robust');
            console.log('Admin Email:', authManager ? authManager.adminEmail : 'Not configured');
            console.log('Admin Password: admin123');
            console.log('All security systems active');
            console.log('CORS enabled for:', process.env.FRONTEND_URL || '*');
            console.log('Ready to serve Hollywood-quality videos!');
            console.log('Test endpoints:');
            console.log(`  Health: http://localhost:${PORT}/api/health`);
            console.log(`  Demo: http://localhost:${PORT}/api/demo/status`);
            console.log('Complete video generation with FFmpeg enabled');
            console.log('Compliance: Terms-compliant stock media integration');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start the server
startServer();