export const seedThoughts = [
  {
    content: 'Evaluate temperature vs. factuality tradeoffs for long-context summarization.',
    tags: ['AI/LLMs', 'Evaluation', 'Long-Context'],
  },
  {
    content: 'Compare function-calling schemas between GPT-4.1 and Claude for tool routing.',
    tags: ['AI/LLMs', 'Tooling', 'Routing'],
  },
  {
    content: 'Design prompt scaffolding that enforces citations without exposing chain-of-thought.',
    tags: ['AI/LLMs', 'Prompting', 'Safety'],
  },
  {
    content: 'Investigate KV-cache reuse across multi-turn agents to reduce latency.',
    tags: ['AI/LLMs', 'Performance', 'Agents'],
  },
  {
    content: 'Draft a rubric for hallucination detection in technical explanations.',
    tags: ['AI/LLMs', 'Reliability', 'Rubrics'],
  },
  {
    content: 'Test self-consistency sampling versus beam search for planning tasks.',
    tags: ['AI/LLMs', 'Planning', 'Sampling'],
  },
  {
    content: 'Study token attribution techniques to measure model focus in retrieval prompts.',
    tags: ['AI/LLMs', 'Interpretability', 'Retrieval'],
  },
  {
    content: 'Prototype a system prompt that enforces security boundaries for agent tools.',
    tags: ['AI/LLMs', 'Security', 'Agents'],
  },
  {
    content: 'Map question decomposition to graph neighborhoods before vector retrieval.',
    tags: ['GraphRAG', 'Decomposition', 'Retrieval'],
  },
  {
    content: 'Use relation-type weighting to prioritize edges in GraphRAG ranking.',
    tags: ['GraphRAG', 'Ranking', 'Edges'],
  },
  {
    content: 'Build a hybrid index: vector for text, graph for entities.',
    tags: ['GraphRAG', 'Indexing', 'Hybrid'],
  },
  {
    content: 'Experiment with community detection to create subgraph capsules.',
    tags: ['GraphRAG', 'Communities', 'Clustering'],
  },
  {
    content: 'Add temporal decay to GraphRAG scores to favor fresh knowledge.',
    tags: ['GraphRAG', 'Recency', 'Scoring'],
  },
  {
    content: 'Use BFS depth=2 with rerank to reduce graph drift.',
    tags: ['GraphRAG', 'Traversal', 'Relevance'],
  },
  {
    content: 'Define entity resolution rules for ambiguous company names.',
    tags: ['Knowledge Graphs', 'Entities', 'Disambiguation'],
  },
  {
    content: 'Evaluate schema evolution strategies for dynamic knowledge graphs.',
    tags: ['Knowledge Graphs', 'Schema', 'Evolution'],
  },
  {
    content: 'Model causal links as separate edge types to avoid conflation.',
    tags: ['Knowledge Graphs', 'Causality', 'Edges'],
  },
  {
    content: 'Use typed properties for evidence confidence and provenance.',
    tags: ['Knowledge Graphs', 'Provenance', 'Trust'],
  },
  {
    content: 'Introduce graph embeddings for cross-modal queries.',
    tags: ['Knowledge Graphs', 'Embeddings', 'Multimodal'],
  },
  {
    content: 'Normalize relation naming conventions to prevent duplicates.',
    tags: ['Knowledge Graphs', 'Ontology', 'Consistency'],
  },
  {
    content: 'Separate ingestion, enrichment, and indexing into distinct queues.',
    tags: ['Architecture', 'Pipeline', 'Queues'],
  },
  {
    content: 'Create a read model optimized for graph queries and a write model for ingest.',
    tags: ['Architecture', 'CQRS', 'Models'],
  },
  {
    content: 'Use event sourcing for capture events to enable replay.',
    tags: ['Architecture', 'Event Sourcing', 'Capture'],
  },
  {
    content: 'Add observability spans around ingestion pipeline stages.',
    tags: ['Architecture', 'Observability', 'Tracing'],
  },
  {
    content: 'Consider a GPU worker pool for embedding throughput.',
    tags: ['Architecture', 'Performance', 'Embeddings'],
  },
  {
    content: 'Cache summary cards in Redis with invalidation on edits.',
    tags: ['Architecture', 'Caching', 'Summaries'],
  },
  {
    content: 'Adopt a capture-first workflow: raw input before structure.',
    tags: ['PKM', 'Workflow', 'Capture'],
  },
  {
    content: 'Use weekly review nodes that link to high-signal clusters.',
    tags: ['PKM', 'Review', 'Linking'],
  },
  {
    content: 'Create a tagging taxonomy for research versus action items.',
    tags: ['PKM', 'Taxonomy', 'Tags'],
  },
  {
    content: 'Integrate next-action extraction into memory cards.',
    tags: ['PKM', 'Tasks', 'Automation'],
  },
  {
    content: 'Define a concept maturity score based on references.',
    tags: ['PKM', 'Metrics', 'Learning'],
  },
  {
    content: 'Use node size to represent degree centrality and dampen large hubs.',
    tags: ['Visualization', 'Graph', 'Sizing'],
  },
  {
    content: 'Add motion cues for edge traffic to signal active clusters.',
    tags: ['Visualization', 'Motion', 'Edges'],
  },
  {
    content: 'Use fog and scan rings to convey depth in the graph.',
    tags: ['Visualization', 'Depth', 'Scene'],
  },
  {
    content: 'Add camera fly-to easing for cinematic focus.',
    tags: ['Visualization', 'Camera', 'Motion'],
  },
  {
    content: 'Render labels only when camera distance is below threshold.',
    tags: ['Visualization', 'Labels', 'LOD'],
  },
  {
    content: 'Treat the graph as an externalized working memory, not a database.',
    tags: ['Philosophy', 'Systems', 'Cognition'],
  },
  {
    content: 'Bias toward precision over recall when capturing thoughts.',
    tags: ['Philosophy', 'Quality', 'Capture'],
  },
  {
    content: 'Use constraints to shape creativity rather than remove it.',
    tags: ['Philosophy', 'Creativity', 'Constraints'],
  },
  {
    content: 'Define knowledge coherence as the ability to traverse concepts quickly.',
    tags: ['Philosophy', 'Coherence', 'Navigation'],
  },
];

export default seedThoughts;
