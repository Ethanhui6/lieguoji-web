/** A label for the current step, not a guessed percentage of the whole job.
 * Keep the original stage in the view's diagnostic data attribute. */
export function atlasGenerationProgressLabel(stage: string): string {
  if (/hydrology|drainage|水文/i.test(stage)) return '计算地形流向';
  if (/海床|海盆|海岭|ocean|sea-floor/i.test(stage)) return '塑造海底';
  if (/山脉|低地|山系|ridge|highland|coarse-reference|continuous-heights/i.test(stage)) return '生成山脉低地';
  if (/提交|写入草稿|保存|备份|commit|persist|durable|stage-atlas|stage-block/i.test(stage)) return '保存地图';
  if (/verify|validate|audit|hash|lock|核验|校验|检查|摘要|保护/i.test(stage)) return '检查地图';
  if (/outline|coast|distance|island|海岸|轮廓|岛链|design-field/i.test(stage)) return '描绘海岸';
  if (/render|display|texture|raster|绘制|显示|纹理/i.test(stage)) return '绘制地图';
  if (/读取|恢复|复制|分页|加载|copy|read|load|takeover|clone|receive|transport|prepare|owner|classify|splice|merge/i.test(stage)) return '整理地图';
  // Unknown internal identifiers are retained only in diagnostics. Existing
  // descriptive Chinese IO stages remain useful without introducing a false ETA.
  return /[a-z][a-z-]+/i.test(stage) ? '处理地图' : stage;
}
