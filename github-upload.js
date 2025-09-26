const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

let connectionSettings = null;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  connectionSettings = data.items?.[0];

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    // Skip git, node_modules, and other unwanted directories
    if (item.startsWith('.') || item === 'node_modules' || item === 'attached_assets') {
      continue;
    }
    
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...await getAllFiles(fullPath, baseDir));
    } else {
      const relativePath = path.relative(baseDir, fullPath);
      files.push({
        path: relativePath.replace(/\\/g, '/'), // Use forward slashes for GitHub
        fullPath: fullPath
      });
    }
  }
  
  return files;
}

async function uploadToGitHub() {
  try {
    console.log('🔗 Connecting to GitHub...');
    const github = await getUncachableGitHubClient();
    
    // Get authenticated user
    const { data: user } = await github.rest.users.getAuthenticated();
    console.log(`✅ Connected as: ${user.login}`);
    
    const owner = 'Shreeraam23';
    const repo = 'telegram-music-bot-updated';
    
    console.log(`📦 Uploading to ${owner}/${repo}...`);
    
    // Check if repository exists
    let repository;
    try {
      const { data } = await github.rest.repos.get({ owner, repo });
      repository = data;
      console.log('✅ Repository found');
    } catch (error) {
      if (error.status === 404) {
        console.log('📝 Repository not found, creating...');
        const { data } = await github.rest.repos.createForAuthenticatedUser({
          name: repo,
          description: 'Telegram Music Bot with Web Player - Netlify Ready',
          private: false
        });
        repository = data;
        console.log('✅ Repository created');
      } else {
        throw error;
      }
    }
    
    // Get all files
    console.log('📂 Collecting files...');
    const files = await getAllFiles('.');
    console.log(`📄 Found ${files.length} files to upload`);
    
    // Get current default branch ref
    let ref;
    try {
      const { data } = await github.rest.git.getRef({
        owner,
        repo,
        ref: 'heads/main'
      });
      ref = data;
    } catch (error) {
      if (error.status === 404) {
        // Repository is empty, we'll create the first commit
        ref = null;
      } else {
        throw error;
      }
    }
    
    // Create blobs for all files
    console.log('📤 Uploading files...');
    const tree = [];
    
    for (const file of files) {
      console.log(`  ⬆️  ${file.path}`);
      
      const content = fs.readFileSync(file.fullPath);
      const { data: blob } = await github.rest.git.createBlob({
        owner,
        repo,
        content: content.toString('base64'),
        encoding: 'base64'
      });
      
      tree.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }
    
    // Create tree
    console.log('🌳 Creating file tree...');
    const { data: newTree } = await github.rest.git.createTree({
      owner,
      repo,
      tree,
      base_tree: ref?.object?.sha
    });
    
    // Create commit
    console.log('💾 Creating commit...');
    const { data: commit } = await github.rest.git.createCommit({
      owner,
      repo,
      message: 'Upload Telegram Music Bot with hardcoded token for Netlify deployment',
      tree: newTree.sha,
      parents: ref ? [ref.object.sha] : []
    });
    
    // Update reference
    console.log('🔄 Updating main branch...');
    if (ref) {
      await github.rest.git.updateRef({
        owner,
        repo,
        ref: 'heads/main',
        sha: commit.sha
      });
    } else {
      await github.rest.git.createRef({
        owner,
        repo,
        ref: 'refs/heads/main',
        sha: commit.sha
      });
    }
    
    console.log('✅ Successfully uploaded to GitHub!');
    console.log(`🌐 Repository URL: https://github.com/${owner}/${repo}`);
    console.log(`🎯 Commit SHA: ${commit.sha}`);
    
    return {
      success: true,
      url: `https://github.com/${owner}/${repo}`,
      commit: commit.sha
    };
    
  } catch (error) {
    console.error('❌ Error uploading to GitHub:', error.message);
    throw error;
  }
}

// Run the upload
uploadToGitHub()
  .then(result => {
    console.log('\n🎉 Upload completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Upload failed:', error.message);
    process.exit(1);
  });