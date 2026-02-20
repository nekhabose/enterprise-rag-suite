from chunking import ChunkingFactory

# Test text
text = """
# Introduction

This is a sample document with multiple paragraphs.

This is the second paragraph with some content.
It has multiple sentences. Each sentence adds information.

## Section 1

Here is another section with more content.
This section discusses various topics.

The content continues here with additional details.
"""

# Test all strategies
strategies = ['fixed_size', 'paragraph', 'semantic', 'sentence']

for strategy in strategies:
    print(f"\n{'='*60}")
    print(f"Testing: {strategy}")
    print('='*60)
    
    chunker = ChunkingFactory.create(strategy)
    chunks = chunker.chunk(text)
    
    print(f"Created {len(chunks)} chunks:")
    for i, chunk in enumerate(chunks[:3]):  # Show first 3
        print(f"\nChunk {i+1}:")
        print(f"Content: {chunk.content[:100]}...")
        print(f"Metadata: {chunk.metadata}")