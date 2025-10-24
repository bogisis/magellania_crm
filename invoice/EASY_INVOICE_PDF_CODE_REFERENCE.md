# EasyInvoicePDF Stripe Template - Code Reference

**Дата:** 24 октября 2025
**Статус:** ✅ Реализовано в invoice-generator.html
**Источник:** `/invoice_exampes/easy-invoice-pdf/src/app/(app)/components/invoice-pdf-stripe-template/`

## 📋 Обзор

Данный документ описывает точное соответствие между **EasyInvoicePDF Stripe Template** (React-PDF) и **invoice-generator.html** (HTML/CSS для печати).

## Project Location
```
/Users/bogisis/Desktop/сметы/for_deploy/invoice_exampes/easy-invoice-pdf/
```

## Screenshots Available
```
.github/screenshots/
├── stripe.png              # Basic Stripe template
├── stripe-with-logo.png    # Stripe template with company logo
└── default.png             # Default invoice template
```

---

## Template File Structure

```
src/app/(app)/components/invoice-pdf-stripe-template/
├── index.tsx                      # Main template component (290 lines)
├── stripe-invoice-header.tsx      # Logo & title section (56 lines)
├── stripe-invoice-info.tsx        # Invoice number & dates (83 lines)
├── stripe-seller-buyer-info.tsx   # Seller & buyer details (87 lines)
├── stripe-due-amount.tsx          # Amount due + pay link (59 lines)
├── stripe-items-table.tsx         # Items/services table (133 lines)
├── stripe-totals.tsx              # Subtotal, VAT, total (134 lines)
└── stripe-footer.tsx              # Footer with metadata (62 lines)
```

---

## Core Style Constants (from index.tsx)

```javascript
// Font Family
const fontFamily = "Inter";

// Font Registration
Font.register({
  family: fontFamily,
  fonts: [
    { src: "Inter-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
    { src: "Inter-Medium.ttf", fontWeight: 500, fontStyle: "normal" },
    { src: "Inter-SemiBold.ttf", fontWeight: 600, fontStyle: "normal" }
  ]
});

// Main Styles Object (STRIPE_TEMPLATE_STYLES)
export const STRIPE_TEMPLATE_STYLES = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 0,
    fontFamily: fontFamily,
    fontWeight: 400,
  },
  
  // Header Bar - 4px golden yellow
  headerBar: {
    backgroundColor: "#fbbf24",
    height: 4,
    width: "100%",
  },
  
  // Main content area
  content: {
    paddingLeft: 30,
    paddingRight: 30,
    paddingTop: 27,
    paddingBottom: 27,
  },
  
  // Typography Utilities
  fontSize8: { fontSize: 8 },
  fontSize9: { fontSize: 9 },
  fontSize10: { fontSize: 10 },
  fontSize11: { fontSize: 11 },
  fontSize12: { fontSize: 12 },
  fontSize14: { fontSize: 14 },
  fontSize16: { fontSize: 16 },
  fontSize18: { fontSize: 18 },
  fontSize24: { fontSize: 24 },
  fontRegular: { fontFamily: fontFamily, fontWeight: 400 },
  fontMedium: { fontFamily: fontFamily, fontWeight: 500 },
  fontBold: { fontFamily: fontFamily, fontWeight: 600 },
  
  // Colors
  textGray: { color: "#6b7280" },
  textDark: { color: "#111827" },
  
  // Layout
  row: { flexDirection: "row", alignItems: "center" },
  spaceBetween: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  
  // Spacing Utilities
  mb1: { marginBottom: 1 },
  mb2: { marginBottom: 2 },
  mb3: { marginBottom: 3 },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb20: { marginBottom: 20 },
  mb24: { marginBottom: 24 },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  mt16: { marginTop: 16 },
  mt24: { marginTop: 24 },
  
  // Table Styles
  table: { display: "flex", width: "100%" },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#010000",  // Pure black
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  
  // Table Column Widths
  colDescription: { flex: 3 },
  colQty: { flex: 0.8, textAlign: "center" },
  colUnitPrice: { flex: 1.2, textAlign: "right" },
  colTax: { flex: 0.8, textAlign: "right" },
  colAmount: { flex: 1.2, textAlign: "right" },
  
  // Totals Section
  totalsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 1,
  },
  borderTop: {
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
  },
  
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
  },
});
```

---

## Component Code Snippets

### 1. StripeInvoiceHeader
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-invoice-header.tsx`

**Key Features:**
- Conditional logo display
- Logo positioning (top-right)
- Logo max dimensions: 110px × 40px with `objectFit: "contain"`
- Title alignment: left-aligned without logo, space-between with logo

```javascript
// Header with logo and title side by side
<View style={[
  styles.spaceBetween,
  {
    alignItems: "flex-start",
    minHeight: 50, // Ensure consistent height
  },
]}>
  <View style={{ flex: 1, alignItems: "flex-start" }}>
    <Text style={[styles.fontSize18, styles.fontBold, styles.textDark]}>
      Invoice
    </Text>
  </View>
  <View style={{ flex: 1, alignItems: "flex-end" }}>
    <Image
      src={invoiceData.logo}
      style={{
        maxWidth: 110,
        maxHeight: 40,
        objectFit: "contain",
      }}
    />
  </View>
</View>
```

---

### 2. StripeInvoiceInfo
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-invoice-info.tsx`

**Key Features:**
- Three field rows: Invoice number, Date of issue, Date due
- Labels are Medium (500), Values are Bold (600)
- Column width adjustment for different languages
  - DE: 100px for invoice number labels
  - EN: 90px for labels
  - Other: 105px for labels
- Gap: 2px between rows

```javascript
<View style={[styles.mb1, styles.row, { alignItems: "baseline" }]}>
  {/* Invoice number text column */}
  <View style={{ width: COLUMN_WIDTH }}>
    <Text style={[
      styles.fontSize9,
      styles.fontBold,
      { maxWidth: INVOICE_NUMBER_MAX_WIDTH },
    ]}>
      {t.stripe.invoiceNumber}
    </Text>
  </View>
  {/* Invoice number value column */}
  <Text style={[styles.fontSize9, styles.fontBold]}>
    {invoiceNumberValue}
  </Text>
</View>
```

---

### 3. StripeSellerBuyerInfo
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-seller-buyer-info.tsx`

**Key Features:**
- Two-column layout with fixed widths
- Seller: marginRight 70px, width 160px
- Buyer: width 160px
- Each field has marginBottom 3
- Supports conditional field visibility (VAT, account, SWIFT, notes)

```javascript
<View style={{ flexDirection: "row", marginBottom: 24 }}>
  {/* Seller info */}
  <View style={{ marginRight: 70, width: "160px" }}>
    <Text style={[styles.fontSize10, styles.fontBold, styles.mb3]}>
      {invoiceData.seller.name}
    </Text>
    <Text style={[styles.fontSize9, styles.mb3]}>
      {invoiceData.seller.address}
    </Text>
    {/* ... more fields ... */}
  </View>
  
  {/* Buyer info */}
  <View style={{ width: "160px" }}>
    <Text style={[styles.fontSize10, styles.fontBold, styles.mb3]}>
      {t.stripe.billTo}
    </Text>
    {/* ... buyer details ... */}
  </View>
</View>
```

---

### 4. StripeDueAmount
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-due-amount.tsx`

**Key Features:**
- Large bold text: "€10,000.00 due July 23, 2025"
- Optional "Pay Online" link in Stripe purple (#635BFF)
- fontSize 14 for amount, fontSize 10 for link
- Link is underlined and bold

```javascript
<View>
  <Text style={[styles.fontSize14, styles.fontBold, styles.mb8]}>
    {formattedInvoiceTotal} {t.stripe.due} {paymentDueDate}
  </Text>
  {hasPayOnlineUrl ? (
    <Link
      href={invoiceData.stripePayOnlineUrl}
      style={[
        styles.fontSize10,
        styles.fontBold,
        { color: "#635BFF", textDecoration: "underline" },
      ]}
    >
      {t.stripe.payOnline}
    </Link>
  ) : null}
</View>
```

---

### 5. StripeItemsTable
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-items-table.tsx`

**Key Features:**
- Columns: Description, Qty, Unit Price, Tax (conditional), Amount
- Service period display: "July 1, 2025 – July 31, 2025"
- VAT column only shown if any item has numeric VAT
- Qty formatted without decimals
- Header fontSize 8, data fontSize 10-11

```javascript
<View style={[styles.table, styles.mt24]}>
  {/* Table header */}
  <View style={styles.tableHeader}>
    <View style={styles.colDescription}>
      <Text style={[styles.fontSize8]}>{t.stripe.description}</Text>
    </View>
    <View style={styles.colQty}>
      <Text style={[styles.fontSize8]}>{t.stripe.qty}</Text>
    </View>
    <View style={styles.colUnitPrice}>
      <Text style={[styles.fontSize8]}>{t.stripe.unitPrice}</Text>
    </View>
    {canShowVat ? (
      <View style={styles.colTax}>
        <Text style={[styles.fontSize8]}>{t.stripe.tax}</Text>
      </View>
    ) : null}
    <View style={styles.colAmount}>
      <Text style={[styles.fontSize8]}>{t.stripe.amount}</Text>
    </View>
  </View>

  {/* Table rows */}
  {invoiceData.items.map((item, index) => (
    <View style={styles.tableRow} key={index}>
      <View style={styles.colDescription}>
        <Text style={[styles.fontSize10]}>{item.name}</Text>
        <Text style={[styles.fontSize9, styles.mt4]}>
          {servicePeriodStart} – {servicePeriodEnd}
        </Text>
      </View>
      <View style={styles.colQty}>
        <Text style={[styles.fontSize11, styles.textDark]}>
          {formattedAmount}
        </Text>
      </View>
      {/* ... more columns ... */}
    </View>
  ))}
</View>
```

---

### 6. StripeTotals
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-totals.tsx`

**Key Features:**
- Right-aligned section (50% width container)
- Dynamic VAT rows showing per-item breakdown
- VAT items displayed in REVERSE order (Stripe-like behavior)
- Each row: label + amount, space-between
- Rows: Subtotal → Total excl. tax → VAT rows → Total → Amount Due

```javascript
<View style={{ alignItems: "flex-end", marginTop: 24 }}>
  <View style={{ width: "50%" }}>
    {/* Subtotal */}
    <View style={[styles.totalRow, styles.borderTop, { paddingVertical: 1.5 }]}>
      <Text style={[styles.fontSize9]}>{t.stripe.subtotal}</Text>
      <Text style={[styles.fontSize9, styles.textDark]}>
        {formattedSubtotal}
      </Text>
    </View>

    {/* VAT rows - shown in reverse order */}
    {[...(invoiceData?.items ?? [])].reverse().map((item, index) => {
      if (typeof item.vat !== "number") {
        return null;
      }

      return (
        <View
          key={index}
          style={[styles.totalRow, styles.borderTop, { paddingVertical: 1.5 }]}
        >
          <Text style={[styles.fontSize9]}>
            VAT ({item.vat}% on {formattedNetAmount})
          </Text>
          <Text style={[styles.fontSize9, styles.textDark]}>
            {formattedVatAmount}
          </Text>
        </View>
      );
    })}

    {/* Total and Amount Due */}
    <View style={[styles.totalRow, styles.borderTop, { paddingVertical: 1.5 }]}>
      <Text style={[styles.fontSize9, styles.fontBold, styles.textDark]}>
        {t.stripe.amountDue}
      </Text>
      <Text style={[styles.fontSize9, styles.fontBold, styles.textDark]}>
        {formattedInvoiceTotal}
      </Text>
    </View>
  </View>
</View>
```

---

### 7. StripeFooter
**File**: `/src/app/(app)/components/invoice-pdf-stripe-template/stripe-footer.tsx`

**Key Features:**
- Fixed positioning at bottom of page
- Invoice number (if exists)
- Amount due + date
- "Created with easyinvoicepdf.com" link
- Page numbers: "Page 1 of 1"
- Items separated by · (bullet) character
- fontSize 8 throughout

```javascript
<View style={styles.footer} fixed>
  <View style={styles.spaceBetween}>
    <View style={[styles.row, { gap: 3 }]}>
      {invoiceNumber && (
        <>
          <Text style={[styles.fontSize8]}>{invoiceNumber}</Text>
          <Text style={[styles.fontSize8]}>·</Text>
        </>
      )}
      <Text style={[styles.fontSize8]}>
        {formattedInvoiceTotal} {t.stripe.due} {paymentDueDate}
      </Text>
      <Text style={[styles.fontSize8]}>·</Text>
      <Text style={[styles.fontSize8]}>
        {t.createdWith}{" "}
        <Link
          style={[styles.fontSize8, { color: "blue" }]}
          src={PROD_WEBSITE_URL}
        >
          https://easyinvoicepdf.com
        </Link>
      </Text>
    </View>
    <Text
      style={[styles.fontSize8]}
      render={({ pageNumber, totalPages }) =>
        `${t.stripe.page} ${pageNumber} ${t.stripe.of} ${totalPages}`
      }
    />
  </View>
</View>
```

---

## Color Reference

```javascript
// Primary Colors
const headerBarYellow = "#fbbf24";      // Golden yellow
const stripePurple = "#635BFF";         // Stripe's purple
const pureBlack = "#010000";            // Table header border

// Text Colors
const textDark = "#111827";             // Main text
const textGray = "#6b7280";             // Secondary text
const white = "#FFFFFF";                // Paper background

// Border/Background Colors
const lightGray = "#e5e7eb";            // Dividers, borders
const offWhite = "#f9fafb";             // Box backgrounds
```

---

## Typography Hierarchy

```javascript
// Font Weights
fontWeight: 400  // Regular - body text
fontWeight: 500  // Medium - secondary labels
fontWeight: 600  // SemiBold - emphasis, values

// Font Sizes
8px   - Footer, column headers, small text
9px   - Metadata, table data, small body text
10px  - Section labels, body text
11px  - Table row data
14px  - Due amount headline
18px  - Main "Invoice" title
24px  - Not used in current template

// Font Family
"Inter" - All text (responsive, clean, modern)
```

---

## Spacing System

```javascript
// Vertical Spacing
Margin Bottom: 1, 2, 3, 4, 8, 12, 16, 20, 24
Margin Top: 2, 4, 8, 16, 24
Padding: Explicit values (not system)

// Horizontal Spacing
Page padding: 30px left/right
Column margins: 70px between seller/buyer
Logo gap: 50% flex between title and image
Table gaps: Defined by flex ratios

// Section Gaps
Between major sections: 24px (mb24)
Between metadata fields: 2px (gap)
Between seller/buyer fields: 3px (mb3)
```

---

## Responsive Considerations

While this is a fixed-size PDF template, it includes language-specific adjustments:

```javascript
// Language-specific column widths
const INVOICE_NUMBER_MAX_WIDTH = language === "de" ? 100 : 80;
const COLUMN_WIDTH = language === "en" ? 90 : 105;
```

This accounts for text length variations in different languages.

---

## Multi-language Support

The template uses the `TRANSLATIONS` object to handle:
- All labels and field names
- Month names (via dayjs locales)
- Currency formatting
- Date formatting

Supported languages:
- English (en)
- Polish (pl)
- German (de)
- Spanish (es)
- Portuguese (pt)
- Russian (ru)
- Ukrainian (uk)
- French (fr)
- Italian (it)
- Dutch (nl)

---

## React-PDF Dependencies

```javascript
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  Image,
  Link,
} from "@react-pdf/renderer/lib/react-pdf.browser";
```

Key features used:
- StyleSheet.create() for styles
- Font.register() for custom fonts
- Document/Page for PDF structure
- View for containers
- Text for content
- Image for logos
- Link for clickable URLs

---

## Key Implementation Decisions

1. **Yellow Header**: Subtle 4px bar identifies it as a Stripe-like template
2. **Two-column seller/buyer**: Makes space efficient use while readable
3. **VAT conditional rendering**: Only shows if needed (no clutter)
4. **Reverse order VAT rows**: Mimics Stripe's actual invoice layout
5. **50% width totals**: Right-aligns numbers while keeping text readable
6. **Fixed footer**: Stays at bottom regardless of content length
7. **Flexible memo wrapping**: Main component uses memo() for performance
8. **Language-aware spacing**: Adjusts for text length variations

---

