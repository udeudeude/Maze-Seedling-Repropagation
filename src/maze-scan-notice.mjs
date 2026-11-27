/**
 * Scanner status must not hide calibration failures behind candidate counts.
 * This also deliberately describes partially observed grids as unresolved.
 * A confident line count is not proof of correct photo-to-cell alignment.
 */
export function scanReviewWarning(result) {
  if(!result)return "";
  const quality=result.quality;
  // Any rejected or suspicious recognition result must be explained
  // prominently, even when it returned no wall/marker/hole suggestions.
  if(quality!=="review"&&result.message)return result.message+" ";
  if(result.printedGrid?.status==="supported"){
    const {columns,rows}=result.printedGrid;
    if(Number.isInteger(columns?.cells)&&Number.isInteger(rows?.cells))
      return "Printed paper grid tentatively agrees with "+
        columns.cells+" by "+rows.cells+
        " squares. This does not verify exact wall positions. ";
  }
  return "Printed paper grid is not confidently registered on both axes. "+
    "Check the four photograph corners and playable-grid margins; "+
    "every wall, hole and marker remains a provisional guess. ";
}
