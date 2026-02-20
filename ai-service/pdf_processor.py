"""
Enhanced PDF Processor for Academic Papers
Extracts metadata, citations, tables, figures
"""
import PyPDF2
import pdfplumber
import fitz  # pymupdf
from typing import Dict, List, Optional
import re

class EnhancedPDFProcessor:
    """Advanced PDF processing for research papers"""
    
    def __init__(self):
        """Initialize PDF processor"""
        pass
    
    def extract_text_pypdf2(self, file_path: str) -> str:
        """
        Basic text extraction using PyPDF2
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Extracted text
        """
        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            return text
        except Exception as e:
            raise Exception(f"PyPDF2 extraction failed: {str(e)}")
    
    def extract_with_pdfplumber(self, file_path: str) -> Dict:
        """
        Advanced extraction with pdfplumber (better for tables)
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dict with text, tables, and metadata
        """
        try:
            with pdfplumber.open(file_path) as pdf:
                # Extract text from all pages
                full_text = ""
                tables = []
                
                for page_num, page in enumerate(pdf.pages, start=1):
                    # Extract text
                    page_text = page.extract_text()
                    if page_text:
                        full_text += f"\n--- Page {page_num} ---\n{page_text}"
                    
                    # Extract tables
                    page_tables = page.extract_tables()
                    for table_idx, table in enumerate(page_tables):
                        tables.append({
                            'page': page_num,
                            'table_index': table_idx,
                            'data': table,
                            'text_representation': self._table_to_text(table)
                        })
                
                return {
                    'text': full_text,
                    'tables': tables,
                    'page_count': len(pdf.pages),
                    'metadata': pdf.metadata
                }
        except Exception as e:
            raise Exception(f"pdfplumber extraction failed: {str(e)}")
    
    def extract_with_pymupdf(self, file_path: str) -> Dict:
        """
        Extract with PyMuPDF (best for complex PDFs)
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dict with text, images, and structure
        """
        try:
            doc = fitz.open(file_path)
            
            full_text = ""
            images = []
            toc = []
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Extract text
                page_text = page.get_text()
                full_text += f"\n--- Page {page_num + 1} ---\n{page_text}"
                
                # Extract images
                image_list = page.get_images()
                images.extend([{
                    'page': page_num + 1,
                    'image_index': idx,
                    'xref': img[0]
                } for idx, img in enumerate(image_list)])
            
            # Get table of contents
            toc = doc.get_toc()
            
            doc.close()
            
            return {
                'text': full_text,
                'images': images,
                'toc': toc,
                'page_count': len(doc),
                'metadata': doc.metadata
            }
        except Exception as e:
            raise Exception(f"PyMuPDF extraction failed: {str(e)}")
    
    def extract_metadata(self, file_path: str) -> Dict:
        """
        Extract paper metadata (title, authors, abstract, etc.)
        
        Args:
            file_path: Path to PDF file
            
        Returns:
            Dict with extracted metadata
        """
        try:
            text = self.extract_text_pypdf2(file_path)
            
            # Extract title (usually first non-empty line)
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            title = lines[0] if lines else "Unknown Title"
            
            # Extract abstract
            abstract = self._extract_section(text, "abstract")
            
            # Extract references/citations
            references = self._extract_section(text, "references")
            
            # Extract authors (heuristic: look for names after title)
            authors = self._extract_authors(text)
            
            return {
                'title': title,
                'authors': authors,
                'abstract': abstract,
                'references': references,
                'estimated_paper_type': self._classify_paper_type(text)
            }
        except Exception as e:
            return {
                'title': 'Unknown',
                'authors': [],
                'abstract': '',
                'references': '',
                'error': str(e)
            }
    
    def process_pdf(self, file_path: str, mode: str = "standard") -> Dict:
        """
        Complete PDF processing pipeline
        
        Args:
            file_path: Path to PDF file
            mode: 'standard', 'academic', or 'advanced'
            
        Returns:
            Dict with extracted content
        """
        try:
            if mode == "standard":
                # Basic extraction
                text = self.extract_text_pypdf2(file_path)
                return {
                    'text': text,
                    'mode': 'standard',
                    'char_count': len(text),
                    'word_count': len(text.split())
                }
            
            elif mode == "academic":
                # Enhanced extraction for research papers
                metadata = self.extract_metadata(file_path)
                plumber_data = self.extract_with_pdfplumber(file_path)
                
                return {
                    'text': plumber_data['text'],
                    'metadata': metadata,
                    'tables': plumber_data['tables'],
                    'page_count': plumber_data['page_count'],
                    'mode': 'academic',
                    'char_count': len(plumber_data['text']),
                    'word_count': len(plumber_data['text'].split())
                }
            
            elif mode == "advanced":
                # Full extraction with images
                pymupdf_data = self.extract_with_pymupdf(file_path)
                metadata = self.extract_metadata(file_path)
                
                return {
                    'text': pymupdf_data['text'],
                    'metadata': metadata,
                    'images': pymupdf_data['images'],
                    'toc': pymupdf_data['toc'],
                    'page_count': pymupdf_data['page_count'],
                    'mode': 'advanced',
                    'char_count': len(pymupdf_data['text']),
                    'word_count': len(pymupdf_data['text'].split())
                }
            
            else:
                raise ValueError(f"Unknown mode: {mode}")
                
        except Exception as e:
            raise Exception(f"PDF processing failed: {str(e)}")
    
    # Helper methods
    
    def _table_to_text(self, table: List[List]) -> str:
        """Convert table to text representation"""
        if not table:
            return ""
        
        text_rows = []
        for row in table:
            row_text = " | ".join([str(cell) if cell else "" for cell in row])
            text_rows.append(row_text)
        
        return "\n".join(text_rows)
    
    def _extract_section(self, text: str, section_name: str) -> str:
        """Extract a specific section from paper"""
        pattern = rf"{section_name}[\s\n]+(.*?)(?=\n[A-Z][a-z]+[\s\n]|$)"
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        
        if match:
            return match.group(1).strip()[:1000]  # First 1000 chars
        return ""
    
    def _extract_authors(self, text: str) -> List[str]:
        """Extract author names (heuristic)"""
        # Look for patterns like "Author Name, Author Name2"
        lines = text.split('\n')[:10]  # First 10 lines
        
        authors = []
        for line in lines:
            # Look for comma-separated names
            if ',' in line and len(line) < 200:
                potential_authors = [n.strip() for n in line.split(',')]
                if all(len(a.split()) <= 3 for a in potential_authors):
                    authors.extend(potential_authors)
                    break
        
        return authors[:10]  # Max 10 authors
    
    def _classify_paper_type(self, text: str) -> str:
        """Classify paper type based on content"""
        text_lower = text.lower()
        
        if 'experiment' in text_lower and 'results' in text_lower:
            return 'research_paper'
        elif 'review' in text_lower or 'survey' in text_lower:
            return 'review_paper'
        elif 'case study' in text_lower:
            return 'case_study'
        elif 'tutorial' in text_lower or 'guide' in text_lower:
            return 'tutorial'
        else:
            return 'general_document'


# Global instance
pdf_processor = EnhancedPDFProcessor()
