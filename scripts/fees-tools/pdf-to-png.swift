// Render every page of a PDF to PNG with PDFKit (macOS; no poppler needed),
// for fee tables that exist only as images or vector art without a text layer.
//
//   swiftc -O scripts/fees-tools/pdf-to-png.swift -o /tmp/pdf-to-png
//   /tmp/pdf-to-png in.pdf out-prefix [scale]   -> out-prefix-1.png, -2.png ...
// Use scale 1.4 to read by eye and 3 for OCR.
import AppKit
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("usage: pdf-to-png in.pdf out-prefix [scale]\n".data(using: .utf8)!)
  exit(1)
}
let scale = args.count > 3 ? CGFloat(Double(args[3]) ?? 1.5) : 1.5
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let box = page.bounds(for: .mediaBox)
  let image = page.thumbnail(of: NSSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
  let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(args[2])-\(i + 1).png"))
}
print(doc.pageCount)
