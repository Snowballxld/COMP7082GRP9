import pdfplumber

pdf_path = "floorPlans/se06F1Plan.pdf"

with pdfplumber.open(pdf_path) as pdf:
    for page_num, page in enumerate(pdf.pages, start=1):
        print(f"\n--- Page {page_num} ---")
        for word in page.extract_words():
            print(f"({word['x0']:.1f}, {word['top']:.1f}) '{word['text']}'")
