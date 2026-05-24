// Synthia MCP Hub + Control Center — Drop-in addon
// Attach to your existing Express app and database

const path = require('path');

module.exports = function attachSynthiaHub(app, db) {
  // ─── MCP SERVER SETUP ───
  let mcpServer, transport;

  try {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

    mcpServer = new McpServer({
      name: 'synthia-hub',
      version: '1.0.0'
    });

    // Tools AIs can call
    mcpServer.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'synthia_submit_work',
          description: 'Submit completed work to Synthia inbox',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              content: { type: 'string' },
              format: { type: 'string', enum: ['text', 'code', 'analysis'] },
              contextForOthers: { type: 'string' }
            },
            required: ['projectId', 'content']
          }
        },
        {
          name: 'synthia_query_memory',
          description: 'Query Synthia accumulated knowledge',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              maxEvents: { type: 'number', default: 5 }
            },
            required: ['query']
          }
        },
        {
          name: 'synthia_spawn_task',
          description: 'Create a new orchestrated task',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              goal: { type: 'string' },
              assignedTo: { type: 'array', items: { type: 'string' } }
            },
            required: ['name', 'goal']
          }
        },
        {
          name: 'synthia_subscribe_to_project',
          description: 'Subscribe to project updates',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              notifyOn: { type: 'string', enum: ['any_update', 'blockers', 'milestones', 'my_turn'] }
            },
            required: ['projectId']
          }
        },
        {
          name: 'synthia_broadcast_update',
          description: 'Broadcast progress to subscribed AIs',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              updateType: { type: 'string', enum: ['progress', 'blocker', 'completion', 'question'] },
              content: { type: 'string' },
              contextForOthers: { type: 'string' }
            },
            required: ['projectId', 'updateType', 'content']
          }
        },
        {
          name: 'synthia_get_project_status',
          description: 'Get current project status',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' }
            },
            required: ['projectId']
          }
        },
        {
          name: 'synthia_ask_human',
          description: 'Escalate to human for approval',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              question: { type: 'string' },
              urgency: { type: 'string', enum: ['low', 'medium', 'high', 'blocking'] }
            },
            required: ['projectId', 'question']
          }
        }
      ]
    }));

    // Tool handlers
    mcpServer.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'synthia_submit_work':
          return handleSubmitWork(args, db);
        case 'synthia_query_memory':
          return handleQueryMemory(args, db);
        case 'synthia_spawn_task':
          return handleSpawnTask(args, db);
        case 'synthia_subscribe_to_project':
          return handleSubscribe(args, db);
        case 'synthia_broadcast_update':
          return handleBroadcast(args, db);
        case 'synthia_get_project_status':
          return handleGetStatus(args, db);
        case 'synthia_ask_human':
          return handleAskHuman(args, db);
        default:
          return { content: [{ type: 'text', text: 'Unknown tool' }], isError: true };
      }
    });

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      onsessioninitialized: (session) => {
        console.log(`[MCP] AI connected: ${session.id}`);
      }
    });

    mcpServer.connect(transport);

    // Mount MCP endpoint
    app.post('/mcp', (req, res) => {
      transport.handleRequest(req, res, req.body);
    });

    // Auto-discovery
    app.get('/.well-known/mcp.json', (req, res) => {
      res.json({
        $schema: 'https://modelcontextprotocol.io/schemas/server-card/v1.0',
        version: '1.0',
        protocolVersion: '2025-06-18',
        serverInfo: {
          name: 'Synthia Hub',
          version: '1.0.0',
          description: 'Autonomous orchestration hub',
          homepage: 'https://synthia.ai'
        },
        transport: {
          type: 'streamable-http',
          url: 'https://' + req.headers.host + '/mcp'
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true
        }
      });
    });

    console.log('✓ MCP Hub attached');
    console.log('  MCP endpoint: /mcp');
    console.log('  Auto-discovery: /.well-known/mcp.json');

  } catch (e) {
    console.log('⚠ MCP SDK not installed, skipping MCP hub');
    console.log('  Run: npm install @modelcontextprotocol/sdk');
  }

  // ─── CONTROL CENTER ───
  try {
    const attachControlCenter = require('./control-center-api');
    attachControlCenter(app, db);
  } catch (e) {
    console.log('⚠ Control Center not attached:', e.message);
  }

  console.log('\n🧠 Synthia Hub + Control Center ready');
  console.log('   Dashboard: https://your-render-url.com/');
  console.log('   MCP for AIs: https://your-render-url.com/mcp');
};

// ─── MCP HANDLERS ───
async function handleSubmitWork(args, db) {
  const { projectId, content, format, contextForOthers } = args;

  await db.collection('projects').updateOne(
    { id: projectId },
    { $push: { inbox: { ts: Date.now(), type: 'work_submitted', content, format, contextForOthers } } }
  );

  await db.collection('inbox').insertOne({
    ts: Date.now(),
    projectId,
    source: 'ai',
    type: 'work_submitted',
    content: content.slice(0, 200),
    status: 'unread',
    priority: 0.7
  });

  return { content: [{ type: 'text', text: 'Work submitted. Human notified.' }] };
}

async function handleQueryMemory(args, db) {
  const { query, maxEvents } = args;
  const results = await db.collection('inbox')
    .find({ content: { $regex: query, $options: 'i' } })
    .limit(maxEvents || 5)
    .toArray();

  return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
}

async function handleSpawnTask(args, db) {
  const { name, goal, assignedTo } = args;
  const id = 'proj_' + Date.now();

  await db.collection('projects').insertOne({
    id, name, goal,
    assignedTo: assignedTo || [],
    subscribers: [],
    inbox: [{ ts: Date.now(), type: 'task_created', content: `Task: ${name}` }],
    status: 'active',
    created: Date.now()
  });

  return { content: [{ type: 'text', text: `Task created: ${id}` }] };
}

async function handleSubscribe(args, db) {
  const { projectId, notifyOn } = args;
  await db.collection('projects').updateOne(
    { id: projectId },
    { $push: { subscribers: { ai: 'unknown', notifyOn: notifyOn || 'any_update', connected: Date.now() } } }
  );

  const project = await db.collection('projects').findOne({ id: projectId });
  return { content: [{ type: 'text', text: `Subscribed. Context: ${JSON.stringify(project?.inbox?.slice(-3))}` }] };
}

async function handleBroadcast(args, db) {
  const { projectId, updateType, content, contextForOthers } = args;

  await db.collection('projects').updateOne(
    { id: projectId },
    { $push: { inbox: { ts: Date.now(), type: updateType, content, contextForOthers } } }
  );

  if (updateType === 'blocker' || updateType === 'completion') {
    await db.collection('inbox').insertOne({
      ts: Date.now(),
      projectId,
      source: 'ai',
      type: updateType,
      content,
      status: 'unread',
      priority: updateType === 'blocker' ? 0.9 : 0.7
    });
  }

  return { content: [{ type: 'text', text: `Broadcast sent. Type: ${updateType}` }] };
}

async function handleGetStatus(args, db) {
  const { projectId } = args;
  const project = await db.collection('projects').findOne({ id: projectId });

  if (!project) {
    return { content: [{ type: 'text', text: 'Project not found' }], isError: true };
  }

  return { content: [{ type: 'text', text: JSON.stringify({
    id: project.id,
    name: project.name,
    status: project.status,
    subscribers: project.subscribers?.length || 0,
    inboxCount: project.inbox?.length || 0,
    lastUpdate: project.inbox?.[project.inbox.length - 1]?.ts
  }, null, 2) }] };
}

async function handleAskHuman(args, db) {
  const { projectId, question, urgency } = args;

  await db.collection('inbox').insertOne({
    ts: Date.now(),
    projectId,
    source: 'ai',
    type: 'human_question',
    question,
    urgency: urgency || 'medium',
    status: 'pending',
    priority: urgency === 'blocking' ? 1.0 : urgency === 'high' ? 0.8 : 0.5
  });

  return { content: [{ type: 'text', text: `Escalated to human. Urgency: ${urgency || 'medium'}` }] };
}