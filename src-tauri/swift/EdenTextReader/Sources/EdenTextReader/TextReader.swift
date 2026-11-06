// The text reader bridge (D-190). Rust calls three C functions: `eden_text_read_image` and `eden_text_read_pdf` block
// their caller (a blocking thread, never the main one) while Vision recognises the text, and return one JSON document,
// `{ "lines": [{ "text", "confidence", "page" }], "pages", "pagesRead" }`, that the caller frees with `eden_text_free`.
// A file that cannot be decoded answers null. Nothing here reaches the network, writes a file or logs the text.
import CoreGraphics
import Foundation
import ImageIO
import PDFKit
import Vision

private struct Line: Encodable {
    var text: String
    var confidence: Float
    var page: Int
}

private struct Answer: Encodable {
    var lines: [Line]
    var pages: Int
    var pagesRead: Int
}

/// A scanned page is rendered at about twice its size in points, its long edge held to this many pixels.
private let renderScale: CGFloat = 2
private let maxEdge: CGFloat = 3000

/// Whether two boxes sit on one row: their centres are closer than half the shorter one's height.
private func sameRow(_ a: CGRect, _ b: CGRect) -> Bool {
    abs(a.midY - b.midY) <= min(a.height, b.height) / 2
}

/// Vision's lines, top to bottom and then left to right, with the pieces of one row joined by a space (a label and its
/// value often come back as two observations). Its boxes are normalised with the origin at the bottom left, so a higher
/// box sits higher on the page.
private func recognize(_ image: CGImage, orientation: CGImagePropertyOrientation, page: Int) -> [Line]? {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return nil
    }
    let observations = (request.results ?? []).sorted { a, b in
        if !sameRow(a.boundingBox, b.boundingBox) {
            return a.boundingBox.midY > b.boundingBox.midY
        }
        return a.boundingBox.minX < b.boundingBox.minX
    }
    var rows: [(box: CGRect, pieces: [VNRecognizedText])] = []
    for observation in observations {
        guard let best = observation.topCandidates(1).first else { continue }
        if let last = rows.last, sameRow(last.box, observation.boundingBox) {
            rows[rows.count - 1].pieces.append(best)
        } else {
            rows.append((observation.boundingBox, [best]))
        }
    }
    return rows.map { row in
        let characters = row.pieces.reduce(0) { $0 + $1.string.count }
        let weighted = row.pieces.reduce(Float(0)) { $0 + $1.confidence * Float($1.string.count) }
        return Line(
            text: row.pieces.map(\.string).joined(separator: " "),
            confidence: characters > 0 ? weighted / Float(characters) : 0,
            page: page
        )
    }
}

/// The image drawn on white: Vision reads dark text on a transparent background as nothing at all.
private func opaque(_ image: CGImage) -> CGImage? {
    switch image.alphaInfo {
    case .none, .noneSkipFirst, .noneSkipLast:
        return image
    default:
        break
    }
    guard
        let context = CGContext(
            data: nil,
            width: image.width,
            height: image.height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
    else { return nil }
    let frame = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    context.fill(frame)
    context.draw(image, in: frame)
    return context.makeImage()
}

/// The page drawn on white, about twice its size, as Vision reads it best.
private func render(_ page: PDFPage) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    var factor = renderScale
    let longEdge = max(bounds.width, bounds.height) * factor
    if longEdge > maxEdge {
        factor *= maxEdge / longEdge
    }
    let width = Int(bounds.width * factor)
    let height = Int(bounds.height * factor)
    guard width > 0, height > 0,
        let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
    else { return nil }
    context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: factor, y: factor)
    context.translateBy(x: -bounds.minX, y: -bounds.minY)
    page.draw(with: .mediaBox, to: context)
    return context.makeImage()
}

private func encode(_ answer: Answer) -> UnsafeMutablePointer<CChar>? {
    guard let data = try? JSONEncoder().encode(answer) else { return nil }
    return strdup(String(decoding: data, as: UTF8.self))
}

/// The caller's bytes, borrowed for the call: Rust keeps them alive until it returns.
private func borrowed(_ pointer: UnsafePointer<UInt8>?, _ length: Int) -> Data? {
    guard let pointer, length > 0 else { return nil }
    return Data(bytesNoCopy: UnsafeMutableRawPointer(mutating: pointer), count: length, deallocator: .none)
}

@_cdecl("eden_text_read_image")
public func edenTextReadImage(_ pointer: UnsafePointer<UInt8>?, _ length: Int) -> UnsafeMutablePointer<CChar>? {
    guard let data = borrowed(pointer, length),
        let source = CGImageSourceCreateWithData(data as CFData, nil),
        let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil),
        let image = opaque(decoded)
    else { return nil }
    // The EXIF orientation, so a photo taken sideways is read upright.
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let raw = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up
    guard let lines = autoreleasepool(invoking: { recognize(image, orientation: orientation, page: 0) }) else {
        return nil
    }
    return encode(Answer(lines: lines, pages: 1, pagesRead: 1))
}

@_cdecl("eden_text_read_pdf")
public func edenTextReadPdf(
    _ pointer: UnsafePointer<UInt8>?,
    _ length: Int,
    _ maxPages: UInt32
) -> UnsafeMutablePointer<CChar>? {
    guard let data = borrowed(pointer, length), let document = PDFDocument(data: data), !document.isLocked else {
        return nil
    }
    let total = document.pageCount
    let count = min(total, Int(maxPages))
    var lines: [Line] = []
    for index in 0..<count {
        autoreleasepool {
            guard let page = document.page(at: index), let image = render(page) else { return }
            lines += recognize(image, orientation: .up, page: index) ?? []
        }
    }
    return encode(Answer(lines: lines, pages: total, pagesRead: count))
}

@_cdecl("eden_text_free")
public func edenTextFree(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}
