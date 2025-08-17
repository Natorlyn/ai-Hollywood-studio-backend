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

// Environment variables
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-encryption-key';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'casteroai001@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Database and authentication
let db;
let authManager;

// Enhanced Video Generation System
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
            }
        };

        const template = templates[category] || templates['personal-finance'];
        const wordsPerMinute = 150;
        const targetWords = duration * wordsPerMinute;
        
        console.log(`Generating script for ${duration} minutes (target: ${targetWords} words)`);
        
        const introWords = Math.floor(targetWords * 0.15);
        const conclusionWords = Math.floor(targetWords * 0.10);
        const mainContentWords = targetWords - introWords - conclusionWords;
        
        const expandedIntro = this.expandContent(template.intro, introWords, tone);
        
        const wordsPerSection = Math.floor(mainContentWords / template.mainSections.length);
        const expandedSections = template.mainSections.map((section, index) => {
            const sectionContent = this.expandSection(section, wordsPerSection, tone, category);
            return {
                title: section,
                content: sectionContent,
                timing: `${Math.floor(index * (duration / template.mainSections.length))}-${Math.floor((index + 1) * (duration / template.mainSections.length))} minutes`
            };
        });
        
        const expandedConclusion = this.expandContent(template.conclusion, conclusionWords, tone);
        
        const fullContent = [
            expandedIntro,
            ...expandedSections.map(s => s.content),
            expandedConclusion
        ].join('\n\n');
        
        console.log(`Generated script: ${fullContent.split(' ').length} words, ${fullContent.length} characters for ${duration} minutes`);
        
        return {
            title,
            intro: expandedIntro,
            sections: expandedSections,
            conclusion: expandedConclusion,
            content: fullContent,
            scenes: expandedSections.length + 2,
            duration: duration,
            wordCount: fullContent.split(' ').length,
            characterCount: fullContent.length
        };
    }

    expandContent(baseContent, targetWords, tone) {
        const expansions = [
            'Comprehensive research across multiple industries reveals specific patterns that distinguish high performers from average practitioners.',
            'Data analysis from leading institutions shows measurable differences in outcomes when systematic approaches are implemented correctly.',
            'Case study documentation spanning decades provides clear evidence of which methodologies produce sustainable long-term results.',
            'Professional development experts emphasize that skill mastery requires both theoretical understanding and practical application.',
            'Market analysis indicates that individuals who invest time in foundational knowledge consistently outperform those who focus solely on tactics.'
        ];

        let expandedContent = baseContent;
        let currentWords = baseContent.split(' ').length;
        
        let expansionIndex = 0;
        while (currentWords < targetWords && expansionIndex < expansions.length) {
            expandedContent += ' ' + expansions[expansionIndex];
            currentWords = expandedContent.split(' ').length;
            expansionIndex++;
        }
        
        const words = expandedContent.split(' ');
        if (words.length > targetWords) {
            expandedContent = words.slice(0, targetWords).join(' ');
        }
        
        return expandedContent;
    }

    expandSection(sectionTitle, targetWords, tone, category) {
        const examples = [
            'For instance, statistical analysis shows that systematic approaches achieve measurably better outcomes than ad-hoc methods.',
            'Research demonstrates that organizations implementing structured methodologies see consistent improvements in performance metrics.',
            'Case studies reveal that companies following established frameworks achieve their objectives 3x more frequently than those without clear systems.'
        ];

        let content = `Examining ${sectionTitle.toLowerCase()} reveals several critical success factors that determine outcomes. `;
        content += examples[0] + ' ';
        
        let currentWords = content.split(' ').length;
        
        const fillerText = 'Implementation methodology requires systematic evaluation of multiple interconnected variables that influence final outcomes. Best practices documentation emphasizes the importance of establishing clear metrics before beginning any optimization process.';
        
        while (currentWords < targetWords) {
            const remainingWords = targetWords - currentWords;
            const fillerWords = fillerText.split(' ');
            
            if (remainingWords >= fillerWords.length) {
                content += fillerText + ' ';
                currentWords += fillerWords.length;
            } else {
                content += fillerWords.slice(0, remainingWords).join(' ');
                break;
            }
        }
        
        return content.trim();
    }

    async generateVoiceover(script, voiceStyle, title) {
        if (!this.elevenLabsKey) {
            throw new Error('ElevenLabs API key not configured');
        }

        try {
            console.log(`Generating voiceover with ElevenLabs - Voice: ${voiceStyle}`);
            console.log(`Script length: ${script.length} characters`);
            
            const voiceIds = {
                'professional-male': '29vD33N1CtxCmqQRPOHJ',
                'professional-female': 'AZnzlk1XvdvUeBnXmlld',
                'conversational-male': 'pNInz6obpgDQGcFmaJgB',
                'conversational-female': 'XB0fDUnXU5powFXDhCwa'
            };

            const selectedVoiceId = voiceIds[voiceStyle] || voiceIds['professional-male'];
            console.log(`Using voice ID: ${selectedVoiceId} for style: ${voiceStyle}`);
            
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
                {
                    text: script,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.85,
                        similarity_boost: 0.85,
                        style: 0.3,
                        use_speaker_boost: true
                    },
                    output_format: "mp3_44100_128"
                },
                {
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsKey
                    },
                    responseType: 'arraybuffer',
                    timeout: 120000
                }
            );

            const audioFileName = `audio_${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_')}.mp3`;
            const audioFilePath = path.join(this.tempDir, audioFileName);
            
            await fs.writeFile(audioFilePath, response.data);
            console.log(`Voiceover generated successfully: ${audioFileName} (${Math.round(response.data.byteLength / 1024)} KB)`);
            
            return audioFilePath;
            
        } catch (error) {
            console.error('ElevenLabs API error:', error.response?.data || error.message);
            
            if (error.response?.data instanceof Buffer) {
                try {
                    const errorText = error.response.data.toString();
                    const errorObj = JSON.parse(errorText);
                    console.error('ElevenLabs error details:', errorObj);
                    
                    if (errorObj.detail?.status === 'max_character_limit_exceeded') {
                        throw new Error('ElevenLabs character limit exceeded. Please check your usage or upgrade your plan.');
                    }
                } catch (parseError) {
                    console.error('Could not parse ElevenLabs error:', parseError);
                }
            }
            
            throw new Error('Voiceover generation failed: ' + (error.response?.statusText || error.message));
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
                assets.videos = await this.downloadPexelsVideos(category, Math.max(8, sceneCount));
                console.log(`Downloaded ${assets.videos.length} video clips`);
            }

            if (this.pixabayKey && assets.videos.length < 3) {
                assets.images = await this.downloadPixabayImages(category, 3);
                console.log(`Downloaded ${assets.images.length} fallback images`);
            }

            console.log(`Total media assets: ${assets.videos.length} videos, ${assets.images.length} images`);
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
                'personal-finance': ['business meeting', 'office work', 'money counting', 'calculator'],
                'investing': ['stock market', 'trading floor', 'charts graphs', 'business growth'],
                'cryptocurrency': ['technology', 'computer screen', 'digital data', 'coding']
            };

            const terms = searchTerms[category] || ['business meeting', 'office work'];
            const downloadedVideos = [];
            
            for (const term of terms) {
                if (downloadedVideos.length >= count) break;
                
                console.log(`Searching Pexels for: ${term}`);
                const response = await axios.get('https://api.pexels.com/videos/search', {
                    headers: {
                        'Authorization': this.pexelsKey
                    },
                    params: {
                        query: term,
                        per_page: Math.min(5, count - downloadedVideos.length),
                        orientation: 'landscape'
                    },
                    timeout: 10000
                });

                if (response.data.videos && response.data.videos.length > 0) {
                    for (const video of response.data.videos) {
                        if (downloadedVideos.length >= count) break;
                        
                        const videoFile = video.video_files.find(file => 
                            file.quality === 'hd' && file.width >= 1280
                        ) || video.video_files[0];
                        
                        if (videoFile && videoFile.link) {
                            const fileName = `pexels_${term.replace(/\s+/g, '_')}_${Date.now()}_${downloadedVideos.length}.mp4`;
                            const filePath = path.join(this.tempDir, fileName);
                            
                            try {
                                const videoResponse = await axios.get(videoFile.link, { 
                                    responseType: 'stream',
                                    timeout: 30000
                                });
                                const writeStream = fsSync.createWriteStream(filePath);
                                
                                await new Promise((resolve, reject) => {
                                    videoResponse.data.pipe(writeStream);
                                    writeStream.on('finish', resolve);
                                    writeStream.on('error', reject);
                                    setTimeout(reject, 30000);
                                });
                                
                                downloadedVideos.push(filePath);
                                console.log(`Successfully downloaded: ${fileName}`);
                            } catch (downloadError) {
                                console.error(`Failed to download video ${fileName}:`, downloadError.message);
                            }
                        }
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.log(`Successfully downloaded ${downloadedVideos.length} videos`);
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
                'investing': 'investment stock market',
                'cryptocurrency': 'cryptocurrency bitcoin'
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
                },
                timeout: 10000
            });

            const downloadedImages = [];
            
            for (let i = 0; i < Math.min(response.data.hits.length, count); i++) {
                const image = response.data.hits[i];
                const imageUrl = image.webformatURL;
                
                const fileName = `pixabay_image_${Date.now()}_${i}.jpg`;
                const filePath = path.join(this.tempDir, fileName);
                
                try {
                    const imageResponse = await axios.get(imageUrl, { 
                        responseType: 'stream',
                        timeout: 15000
                    });
                    const writeStream = fsSync.createWriteStream(filePath);
                    
                    await new Promise((resolve, reject) => {
                        imageResponse.data.pipe(writeStream);
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                        setTimeout(reject, 15000);
                    });
                    
                    downloadedImages.push(filePath);
                } catch (downloadError) {
                    console.error(`Failed to download image ${fileName}:`, downloadError.message);
                }
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
                await this.createSimpleVideoWithAudio(audioFile, outputPath, durationSeconds);
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
        const videoList = videos.slice(0, Math.min(6, videos.length));
        
        if (videoList.length === 0) {
            throw new Error('No video clips available for compilation');
        }
        
        console.log(`Creating video with ${videoList.length} clips for ${duration} seconds`);
        
        try {
            let filterComplex = '';
            let inputs = `-i "${audioFile}" `;
            
            for (let i = 0; i < videoList.length; i++) {
                inputs += `-i "${videoList[i]}" `;
            }
            
            const segmentDuration = Math.max(4, duration / videoList.length);
            
            for (let i = 0; i < videoList.length; i++) {
                filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setpts=PTS-STARTPTS,trim=duration=${segmentDuration},setpts=PTS-STARTPTS[v${i}];`;
            }
            
            filterComplex += videoList.map((_, i) => `[v${i}]`).join('') + `concat=n=${videoList.length}:v=1:a=0[outv]`;
            
            const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 44100 -af "volume=2.0" -t ${duration} "${outputPath}"`;
            
            console.log('Executing FFmpeg video compilation...');
            await execAsync(command, { timeout: 300000 });
            console.log('Video compilation with clips completed successfully');
            
        } catch (error) {
            console.error('Video compilation with clips failed:', error);
            await this.createSimpleVideoWithAudio(audioFile, outputPath, duration);
        }
    }

    async createVideoFromImages(audioFile, images, outputPath, duration) {
        try {
            console.log(`Creating slideshow video with ${images.length} images`);
            
            const imageDuration = Math.max(3, duration / images.length);
            let filterComplex = '';
            let inputs = `-i "${audioFile}" `;
            
            for (let i = 0; i < images.length; i++) {
                inputs += `-loop 1 -t ${imageDuration} -i "${images[i]}" `;
            }
            
            for (let i = 0; i < images.length; i++) {
                filterComplex += `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fade=t=in:st=0:d=0.5,fade=t=out:st=${imageDuration - 0.5}:d=0.5[v${i}];`;
            }
            
            filterComplex += images.map((_, i) => `[v${i}]`).join('') + `concat=n=${images.length}:v=1:a=0[outv]`;
            
            const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 44100 -af "volume=2.0" -t ${duration} "${outputPath}"`;
            
            await execAsync(command, { timeout: 300000 });
            console.log('Image slideshow video created successfully');
            
        } catch (error) {
            console.error('Image slideshow creation failed:', error);
            await this.createSimpleVideoWithAudio(audioFile, outputPath, duration);
        }
    }

    async createSimpleVideoWithAudio(audioFile, outputPath, duration) {
        try {
            console.log('Creating simple video with gradient background');
            
            const command = `ffmpeg -y -i "${audioFile}" -f lavfi -i "color=gradient=blue:navy:1920:1080:d=${duration}" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 44100 -af "volume=2.0" -t ${duration} -shortest "${outputPath}"`;
            
            await execAsync(command, { timeout: 180000 });
            console.log('Simple video with audio created successfully');
            
        } catch (error) {
            console.error('Simple video creation failed:', error);
            throw error;
        }
    }

    async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return Math.round(stats.size / 1024 / 1024 * 100) / 100;
        } catch (error) {
            return 0;
        }
    }
}

// Modern Encryption System
class SecureVault {
    static encrypt(text) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
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
            const parts = encryptedData.split(':');
            
            if (parts.length !== 2) {
                console.error('Invalid encrypted data format');
                return null;
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }
}

// Authentication Manager
class AuthenticationManager {
    constructor() {
        this.adminEmail = ADMIN_EMAIL;
        this.adminPasswordPlain = ADMIN_PASSWORD;
        this.db = null;
    }

    setDatabase(database) {
        this.db = database;
    }

    async authenticateUser(email, password) {
        try {
            console.log(`Login attempt for: ${email}`);
            
            if (email === this.adminEmail) {
                if (password === this.adminPasswordPlain) {
                    console.log('Admin authenticated via environment variable');
                    return {
                        email: this.adminEmail,
                        role: 'admin',
                        plan: 'enterprise',
                        authenticated: true
                    };
                }
                
                if (this.db) {
                    const adminUser = await this.db.collection('users').findOne({ 
                        email: this.adminEmail,
                        role: 'admin'
                    });
                    
                    if (adminUser && adminUser.password) {
                        const validPassword = await bcrypt.compare(password, adminUser.password);
                        if (validPassword) {
                            console.log('Admin authenticated via database');
                            return {
                                email: adminUser.email,
                                role: adminUser.role,
                                plan: adminUser.plan || 'enterprise',
                                authenticated: true
                            };
                        }
                    }
                }
            }
            
            if (this.db) {
                const user = await this.db.collection('users').findOne({ email });
                if (user && await bcrypt.compare(password, user.password)) {
                    console.log(`User authenticated: ${email}`);
                    return {
                        email: user.email,
                        role: user.role || 'user',
                        plan: user.plan || 'free',
                        authenticated: true
                    };
                }
            }
            
            throw new Error('Invalid credentials');
            
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }

    async initializeAdminUser() {
        if (!this.db) {
            console.log('Database not available, skipping admin user creation');
            return;
        }

        try {
            const existingUser = await this.db.collection('users').findOne({ 
                email: this.adminEmail
            });

            if (existingUser) {
                console.log('Admin user already exists');
                return existingUser;
            }

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
            console.log('Admin user created successfully with ID:', result.insertedId);
            
            return { ...adminUser, _id: result.insertedId };
            
        } catch (error) {
            if (error.code === 11000) {
                console.log('Admin user already exists (duplicate key)');
                return null;
            }
            console.error('Failed to initialize admin user:', error);
            return null;
        }
    }
}

// API key management
async function getDecryptedApiKeys() {
    if (!db) return {};
    
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        const decryptedKeys = {};