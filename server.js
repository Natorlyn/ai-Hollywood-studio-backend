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
        const introWords = Math.floor(targetWords * 0.15);
        const conclusionWords = Math.floor(targetWords * 0.10);
        const mainContentWords = targetWords - introWords - conclusionWords;
        
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
        
        // More varied expansion content to reduce repetition
        const expansions = [
            'Comprehensive research across multiple industries reveals specific patterns that distinguish high performers from average practitioners.',
            'Data analysis from leading institutions shows measurable differences in outcomes when systematic approaches are implemented correctly.',
            'Case study documentation spanning decades provides clear evidence of which methodologies produce sustainable long-term results.',
            'Professional development experts emphasize that skill mastery requires both theoretical understanding and practical application.',
            'Market analysis indicates that individuals who invest time in foundational knowledge consistently outperform those who focus solely on tactics.',
            'Behavioral psychology research demonstrates how cognitive biases can derail even well-intentioned efforts without proper awareness.',
            'Technology integration has transformed traditional approaches, creating new opportunities for those who adapt quickly to changing landscapes.',
            'Risk assessment methodologies help identify potential obstacles before they become significant problems that derail progress.',
            'Performance metrics and tracking systems enable continuous improvement through data-driven decision making processes.',
            'Networking and relationship building remain crucial factors that amplify individual efforts through collaborative partnerships.',
            'Global market trends influence local implementation strategies, requiring adaptive approaches that balance universal principles with regional considerations.',
            'Innovation cycles create windows of opportunity that reward early adopters who position themselves strategically.',
            'Regulatory frameworks continue evolving, necessitating ongoing education to maintain compliance while maximizing operational efficiency.',
            'Resource allocation decisions impact long-term sustainability more than short-term tactical choices.',
            'Quality control processes ensure consistent delivery of results that meet or exceed established standards.',
            'Customer feedback loops provide valuable insights for iterative improvements that enhance overall value propositions.',
            'Competitive analysis reveals market gaps where differentiated approaches can establish strong positioning.',
            'Supply chain optimization reduces costs while improving reliability of resource availability.',
            'Digital transformation initiatives require cultural adaptation alongside technological implementation.',
            'Sustainability considerations increasingly influence strategic planning across all industry sectors.'
        ];

        let expandedContent = baseContent;
        let currentWords = baseContent.split(' ').length;
        
        // Randomize expansions to reduce repetition
        const shuffledExpansions = [...expansions].sort(() => Math.random() - 0.5);
        
        let expansionIndex = 0;
        while (currentWords < targetWords && expansionIndex < shuffledExpansions.length) {
            expandedContent += ' ' + shuffledExpansions[expansionIndex];
            currentWords = expandedContent.split(' ').length;
            expansionIndex++;
        }
        
        // If we need more content, add connecting phrases
        if (currentWords < targetWords) {
            const connectors = [
                'Furthermore, practical implementation requires',
                'Additionally, recent developments indicate that',
                'Moreover, successful practitioners emphasize',
                'In particular, emerging trends suggest',
                'Consequently, optimal results depend on',
                'Similarly, industry leaders recommend',
                'Therefore, strategic planning must consider',
                'Subsequently, effective execution involves'
            ];
            
            const shuffledConnectors = [...connectors].sort(() => Math.random() - 0.5);
            let connectorIndex = 0;
            
            while (currentWords < targetWords && connectorIndex < shuffledConnectors.length) {
                expandedContent += ' ' + shuffledConnectors[connectorIndex] + ' understanding the interconnected nature of these factors.';
                currentWords = expandedContent.split(' ').length;
                connectorIndex++;
            }
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
                'For instance, the 50-30-20 budgeting framework allocates 50% of income to essential needs, 30% to discretionary spending, and 20% to savings and debt repayment.',
                'High-yield savings accounts currently offer annual percentage yields between 4.5-5.2%, significantly outperforming traditional savings options.',
                'Statistical analysis shows that individuals with seven or more income sources achieve financial independence 2.3 times faster than single-income earners.',
                'Compound interest calculations demonstrate that a $5,000 annual investment at 8% returns grows to over $540,000 in 30 years.'
            ],
            'investing': [
                'Historical market data shows the S&P 500 has delivered an average annual return of 10.5% over the past century, despite periodic volatility.',
                'Dollar-cost averaging strategies have outperformed market timing attempts in 87% of 20-year investment periods since 1950.',
                'Asset allocation research indicates that 90% of portfolio performance is determined by allocation decisions rather than individual security selection.',
                'Diversification studies reveal that portfolios with 25-30 uncorrelated assets achieve optimal risk-adjusted returns.'
            ],
            'cryptocurrency': [
                'Blockchain analysis shows Bitcoin has maintained 99.98% uptime since its inception, demonstrating remarkable network reliability.',
                'Institutional adoption accelerated with over $100 billion in corporate Bitcoin holdings reported by publicly traded companies.',
                'DeFi protocols have facilitated over $2 trillion in transaction volume, representing a paradigm shift in financial intermediation.',
                'Energy consumption metrics indicate Bitcoin mining increasingly utilizes renewable sources, with sustainable energy usage exceeding 58%.'
            ],
            'artificial-intelligence': [
                'Machine learning model performance has improved exponentially, with natural language processing accuracy exceeding 95% on standardized benchmarks.',
                'AI implementation studies show productivity gains of 25-40% in organizations that successfully integrate artificial intelligence technologies.',
                'Computer vision systems now achieve superhuman accuracy in medical imaging diagnosis, detecting conditions missed by traditional methods.',
                'Automation forecasts suggest AI will create 97 million new jobs while transforming existing roles across multiple industries.'
            ],
            'startups': [
                'Venture capital data indicates that startups with diverse founding teams are 2.9 times more likely to achieve successful exits.',
                'Customer acquisition cost analysis shows that companies with strong product-market fit achieve 3x lower acquisition costs.',
                'Cash flow management statistics reveal that 82% of business failures result from poor cash flow planning rather than profitability issues.',
                'Scaling research demonstrates that companies maintaining culture during rapid growth achieve 4x higher employee retention rates.'
            ],
            'business': [
                'Operations research indicates that businesses implementing lean methodologies achieve 15-25% cost reductions while improving quality metrics.',
                'Customer experience studies show that companies with superior service delivery generate 5.7 times more revenue than competitors.',
                'Leadership effectiveness analysis reveals that organizations with strong development programs achieve 2.3 times higher employee engagement.',
                'Digital transformation data shows that businesses embracing technology integration increase market share by an average of 12%.'
            ]
        };

        const examples = categoryExamples[category] || categoryExamples['personal-finance'];
        
        const baseExpansions = [
            'Implementation methodology requires systematic evaluation of multiple interconnected variables that influence final outcomes.',
            'Best practices documentation emphasizes the importance of establishing clear metrics before beginning any optimization process.',
            'Strategic planning frameworks provide structured approaches for navigating complex decision-making scenarios.',
            'Risk mitigation strategies help identify potential failure points before they compromise overall project success.',
            'Performance monitoring systems enable real-time adjustments that maintain progress toward established objectives.',
            'Resource optimization techniques maximize efficiency while minimizing waste in operational processes.',
            'Stakeholder engagement protocols ensure alignment across all parties involved in implementation efforts.',
            'Quality assurance processes maintain standards throughout execution phases, preventing costly errors.',
            'Continuous improvement methodologies facilitate ongoing refinement based on performance feedback.',
            'Change management principles help organizations adapt to new processes without disrupting core operations.'
        ];

        let content = `Examining ${sectionTitle.toLowerCase()} reveals several critical success factors that determine outcomes. `;
        
        // Add varied category-specific examples
        const selectedExamples = examples.sort(() => Math.random() - 0.5).slice(0, 2);
        content += selectedExamples.join(' ') + ' ';
        
        // Add randomized base expansions
        const shuffledExpansions = baseExpansions.sort(() => Math.random() - 0.5);
        let currentWords = content.split(' ').length;
        
        for (const expansion of shuffledExpansions) {
            if (currentWords >= targetWords) break;
            content += expansion + ' ';
            currentWords = content.split(' ').length;
        }
        
        // Trim to exact word count
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
            console.log(`Generating voiceover with ElevenLabs - Voice: ${voiceStyle}`);
            
            // Corrected Voice IDs for proper gender mapping
            const voiceIds = {
                'professional-male': '29vD33N1CtxCmqQRPOHJ',
                'professional-female': 'AZnzlk1XvdvUeBnXmlld',
                'conversational-male': 'pNInz6obpgDQGcFmaJgB',
                'conversational-female': 'XB0fDUnXU5powFXDhCwa',
                'authoritative-male': 'onwK4e9ZLuTAKqWW03F9',
                'warm-female': 'oWAxZDx7w5VEj9dCyTzz'
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
            throw new Error('Voiceover generation failed: ' + (error.response?.data?.detail || error.message));
        }
    }

    async gatherMediaAssets(category, sceneCount) {
        try {
            console.log('Gathering media assets...');
            
            const assets = {
                videos: [],
                images: []
            };

            // Prioritize videos over static images for better visual experience
            if (this.pexelsKey) {
                assets.videos = await this.downloadPexelsVideos(category, Math.max(8, sceneCount));
                console.log(`Downloaded ${assets.videos.length} video clips`);
            }

            // Get fewer images since we have videos
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
                'personal-finance': ['business meeting', 'office work', 'money counting', 'calculator', 'financial planning', 'bank', 'investment'],
                'investing': ['stock market', 'trading floor', 'charts graphs', 'business growth', 'financial data', 'analysis', 'portfolio'],
                'cryptocurrency': ['technology', 'computer screen', 'digital data', 'coding', 'futuristic', 'blockchain', 'trading'],
                'artificial-intelligence': ['technology', 'robots', 'computer', 'data center', 'innovation', 'automation', 'machine learning'],
                'startups': ['office space', 'teamwork', 'brainstorming', 'startup office', 'entrepreneurs', 'collaboration', 'innovation'],
                'business': ['business meeting', 'office', 'professional', 'corporate', 'workplace', 'conference', 'presentation']
            };

            const terms = searchTerms[category] || searchTerms['business'];
            const downloadedVideos = [];
            
            // Try multiple search terms to get variety
            for (const term of terms) {
                if (downloadedVideos.length >= count) break;
                
                console.log(`Searching Pexels for: ${term}`);
                const response = await axios.get('https://api.pexels.com/videos/search', {
                    headers: {
                        'Authorization': this.pexelsKey
                    },
                    params: {
                        query: term,
                        per_page: Math.min(10, count - downloadedVideos.length),
                        orientation: 'landscape'
                    },
                    timeout: 10000
                });

                if (response.data.videos && response.data.videos.length > 0) {
                    for (const video of response.data.videos) {
                        if (downloadedVideos.length >= count) break;
                        
                        // Get the best quality video file
                        const videoFile = video.video_files.find(file => 
                            file.quality === 'hd' && file.width >= 1280
                        ) || video.video_files.find(file => file.quality === 'sd') || video.video_files[0];
                        
                        if (videoFile && videoFile.link) {
                            const fileName = `pexels_${term.replace(/\s+/g, '_')}_${Date.now()}_${downloadedVideos.length}.mp4`;
                            const filePath = path.join(this.tempDir, fileName);
                            
                            try {
                                console.log(`Downloading video: ${fileName}`);
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
                
                // Small delay between API calls
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
                'personal-finance': 'business finance money savings',
                'investing': 'investment stock market growth',
                'cryptocurrency': 'cryptocurrency bitcoin blockchain',
                'artificial-intelligence': 'artificial intelligence technology',
                'startups': 'startup entrepreneur business',
                'business': 'business professional corporate'
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
            // Fallback to audio file
            const fallbackPath = path.join(this.outputDir, `audio_${Date.now()}.mp3`);
            await fs.copyFile(audioFile, fallbackPath);
            return fallbackPath;
        }
    }

    async createVideoWithClips(audioFile, videos, outputPath, duration) {
        const videoList = videos.slice(0, Math.min(8, videos.length));
        
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
            
            const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 44100 -af "volume=2.0,highpass=f=80,lowpass=f=15000" -t ${duration} "${outputPath}"`;
            
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
            
            const command = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outv]" -map 0:a -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 44100 -af "volume=2.0,highpass=f=80,lowpass=f=15000" -t ${duration} "${outputPath}"`;
            
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
            
            const command = `ffmpeg -y -i "${audioFile}" -f lavfi -i "color=gradient=blue:navy:1920:1080:d=${duration}" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k -ar 44100 -af "volume=2.0,highpass=f=80,lowpass=f=15000" -t ${duration} -shortest "${outputPath}"`;
            
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
            return Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
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

// Robust Authentication Manager
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
            
            // Admin authentication with environment variable fallback
            if (email === this.adminEmail) {
                // Try direct password comparison first
                if (password === this.adminPasswordPlain) {
                    console.log('Admin authenticated via environment variable');
                    return {
                        email: this.adminEmail,
                        role: 'admin',
                        plan: 'enterprise',
                        authenticated: true
                    };
                }
                
                // Try database authentication
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
            
            // Regular user authentication
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
            // Check if admin already exists by email (any role)
            const existingUser = await this.db.collection('users').findOne({ 
                email: this.adminEmail
            });

            if (existingUser) {
                console.log('User with admin email already exists - updating to admin role and password');
                
                // Update existing user to admin role with new password
                const hashedPassword = await bcrypt.hash(this.adminPasswordPlain, 12);
                
                await this.db.collection('users').updateOne(
                    { email: this.adminEmail },
                    { 
                        $set: { 
                            password: hashedPassword,
                            role: 'admin',
                            plan: 'enterprise',
                            videosLimit: 999999,
                            isActive: true,
                            updatedAt: new Date()
                        }
                    }
                );
                
                console.log('Admin user updated successfully');
                return existingUser;
            }

            // Create new admin user
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
                console.log('Admin user already exists (duplicate key), continuing with authentication...');
                return null;
            }
            console.error('Failed to initialize admin user:', error);
            return null;
        }
    }
}

// Enhanced API key management
async function getDecryptedApiKeys() {
    if (!db) return {};
    
    try {
        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        const decryptedKeys = {};
        let successCount = 0;
        
        for (const key of apiKeys) {
            try {
                const decryptedKey = SecureVault.decrypt(key.encryptedKey);
                if (decryptedKey) {
                    decryptedKeys[key.service] = decryptedKey;
                    successCount++;
                } else {
                    console.error(`Failed to decrypt ${key.service} key`);
                }
            } catch (error) {
                console.error(`Error decrypting ${key.service} key:`, error.message);
            }
        }
        
        console.log(`Successfully decrypted ${successCount} API keys`);
        return decryptedKeys;
        
    } catch (error) {
        console.error('Failed to get API keys:', error);
        return {};
    }
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// Database connection
async function connectToDatabase() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        console.log('Connecting to MongoDB...');
        const client = new MongoClient(MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        await client.connect();
        db = client.db('ai_hollywood_studio');
        
        console.log('MongoDB connected successfully');
        
        // Initialize authentication manager
        authManager = new AuthenticationManager();
        authManager.setDatabase(db);
        
        await initializeDatabase();
        
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
}

async function initializeDatabase() {
    try {
        console.log('Initializing database...');
        
        // Create indexes
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('apikeys').createIndex({ service: 1 }, { unique: true });
        
        // Initialize admin user
        await authManager.initializeAdminUser();
        
        console.log('Database initialization completed');
        
    } catch (error) {
        console.error('Database initialization failed:', error);
    }
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Check FFmpeg availability
        let ffmpegStatus = 'not_available';
        try {
            await execAsync('ffmpeg -version');
            ffmpegStatus = 'available';
        } catch (error) {
            ffmpegStatus = 'not_available';
        }

        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'production',
            compliance: 'terms_compliant',
            message: 'AI Hollywood Studio Backend is running!',
            database: db ? 'connected' : 'disconnected',
            mongoConfigured: !!MONGODB_URI,
            adminEmail: ADMIN_EMAIL,
            ffmpeg: ffmpegStatus
        };

        res.json(healthStatus);
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Demo endpoint for authentication status
app.get('/api/demo/status', (req, res) => {
    res.json({
        message: 'AI Hollywood Studio Backend Demo',
        timestamp: new Date().toISOString(),
        authentication: {
            adminEmail: ADMIN_EMAIL,
            adminPassword: ADMIN_PASSWORD,
            system: 'Robust with fallback'
        },
        features: [
            'Script Generation',
            'ElevenLabs Voiceover',
            'Pexels Stock Videos',
            'Pixabay Stock Images',
            'FFmpeg Compilation'
        ]
    });
});

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, plan = 'free' } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const videoLimits = {
            'free': 3,
            'pro': 50,
            'enterprise': 999999
        };

        const userData = {
            email,
            password: hashedPassword,
            role: 'user',
            plan,
            videosUsed: 0,
            videosLimit: videoLimits[plan] || videoLimits['free'],
            isActive: true,
            createdAt: new Date(),
            compliance: 'terms_compliant'
        };

        const result = await db.collection('users').insertOne(userData);
        
        // Generate token
        const token = jwt.sign(
            { 
                email, 
                role: userData.role, 
                userId: result.insertedId,
                plan: userData.plan 
            }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                email,
                role: userData.role,
                plan: userData.plan,
                videosLimit: userData.videosLimit
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await authManager.authenticateUser(email, password);
        
        const token = jwt.sign(
            { 
                email: user.email, 
                role: user.role, 
                plan: user.plan 
            }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                email: user.email,
                role: user.role,
                plan: user.plan
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Video generation endpoint
app.post('/api/videos/generate', authenticateToken, async (req, res) => {
    try {
        console.log(`Starting video generation for user: ${req.user.email}`);
        
        const { title, category, duration, tone, voiceStyle, visualStyle } = req.body;
        
        console.log(`Video details: ${title}, ${category}, ${duration} minutes`);

        if (!title || !category || !duration) {
            return res.status(400).json({ error: 'Title, category, and duration are required' });
        }

        // Get API keys
        const apiKeys = await getDecryptedApiKeys();
        
        if (Object.keys(apiKeys).length === 0) {
            return res.status(500).json({ 
                error: 'API keys not configured. Please contact administrator.' 
            });
        }

        // Initialize video generator
        const generator = new CompleteVideoGenerator(apiKeys);
        
        // Generate video
        const result = await generator.generateVideo({
            title,
            category,
            duration: parseInt(duration),
            tone: tone || 'professional',
            voiceStyle: voiceStyle || 'professional-male',
            visualStyle: visualStyle || 'corporate'
        });

        console.log(`Video generated successfully: ${title}`);

        res.json({
            success: true,
            message: 'Video generated successfully with complete system',
            video: result,
            downloadUrl: result.downloadUrl
        });

    } catch (error) {
        console.error('Video generation error:', error);
        res.status(500).json({ 
            error: 'Video generation failed', 
            details: error.message 
        });
    }
});

// API key management endpoints
app.get('/api/admin/apikeys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const apiKeys = await db.collection('apikeys').find({ isActive: true }).toArray();
        
        const sanitizedKeys = apiKeys.map(key => ({
            _id: key._id,
            service: key.service,
            createdAt: key.createdAt,
            isActive: key.isActive,
            masked: key.encryptedKey ? `${key.service}_${'*'.repeat(32)}` : 'Not set'
        }));

        res.json({ success: true, apiKeys: sanitizedKeys });

    } catch (error) {
        console.error('Failed to fetch API keys:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

app.post('/api/admin/apikeys', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service, apiKey } = req.body;

        if (!service || !apiKey) {
            return res.status(400).json({ error: 'Service and API key are required' });
        }

        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        // Encrypt the API key
        const encryptedKey = SecureVault.encrypt(apiKey);

        // Update or insert API key
        await db.collection('apikeys').updateOne(
            { service },
            {
                $set: {
                    service,
                    encryptedKey,
                    isActive: true,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );

        console.log(`API key updated for service: ${service}`);

        res.json({
            success: true,
            message: `API key for ${service} updated successfully`
        });

    } catch (error) {
        console.error('Failed to save API key:', error);
        res.status(500).json({ error: 'Failed to save API key' });
    }
});

app.delete('/api/admin/apikeys/:service', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { service } = req.params;

        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        await db.collection('apikeys').updateOne(
            { service },
            { $set: { isActive: false, deactivatedAt: new Date() } }
        );

        console.log(`API key deactivated for service: ${service}`);

        res.json({
            success: true,
            message: `API key for ${service} deactivated successfully`
        });

    } catch (error) {
        console.error('Failed to delete API key:', error);
        res.status(500).json({ error: 'Failed to delete API key' });
    }
});

// File download endpoint
app.get('/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'generated_videos', filename);
        
        // Security check
        if (!filename || filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        // Check if file exists
        if (!fsSync.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set appropriate headers
        const ext = path.extname(filename).toLowerCase();
        const contentType = ext === '.mp4' ? 'video/mp4' : 'audio/mpeg';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Stream the file
        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Debug endpoints (remove in production)
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
                ADMIN_PASSWORD: !!ADMIN_PASSWORD,
                ADMIN_EMAIL: !!ADMIN_EMAIL
            }
        });
    } else {
        res.json({ error: 'No database connection' });
    }
});

app.post('/api/debug/reset-admin', async (req, res) => {
    try {
        if (!db || !authManager) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const hashedPassword = await bcrypt.hash(authManager.adminPasswordPlain, 12);
        
        const result = await db.collection('users').updateOne(
            { email: authManager.adminEmail },
            { 
                $set: { 
                    password: hashedPassword,
                    role: 'admin',
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
        console.error('Password reset failed:', error);
        res.status(500).json({ error: 'Password reset failed' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
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

// Server startup
async function startServer() {
    try {
        console.log('Starting AI Hollywood Studio Backend...');
        
        await connectToDatabase();
        
        app.listen(PORT, () => {
            console.log('AI Hollywood Studio Backend LIVE!');
            console.log(`Server running on port ${PORT}`);
            console.log(`Version: Enhanced Video Generation System`);
            console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
            console.log(`Database: ${db ? 'Connected' : 'Disconnected'}`);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle process termination
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