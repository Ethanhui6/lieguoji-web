const displayLight = (gx, gy) => 1 + Math.max(-.13, Math.min(.13, Math.atan((gx + gy) / 40) / (Math.PI / 2) * .13));
function lightCrossing(a, b) {
    if (a.coverageQ === 0)
        return a;
    if (b.coverageQ === 0)
        return b;
    if (a.xQ > b.xQ || a.xQ === b.xQ && a.yQ > b.yQ)
        [a, b] = [b, a];
    const numerator = 512 * Math.abs(a.coverageQ), denominator = Math.abs(a.coverageQ - b.coverageQ);
    const offset = Math.max(1, Math.min(511, Math.floor((2 * numerator + denominator) / (2 * denominator))));
    return { xQ: a.xQ + Math.sign(b.xQ - a.xQ) * offset, yQ: a.yQ + Math.sign(b.yQ - a.yQ) * offset, coverageQ: 0, heightMeters: 0 };
}
export function detailTerrainNodeLights(node, west, east, north, south) {
    const light = (land) => {
        const inside = (point) => land ? point.coverageQ >= 0 : point.coverageQ <= 0;
        if (!inside(node))
            return 1;
        const sameSide = (point) => inside(point) ? point : lightCrossing(node, point);
        const w = sameSide(west), e = sameSide(east), n = sameSide(north), s = sameSide(south);
        const gx = e.xQ === w.xQ ? 0 : 256 * (e.heightMeters - w.heightMeters) / (e.xQ - w.xQ);
        const gy = s.yQ === n.yQ ? 0 : 256 * (s.heightMeters - n.heightMeters) / (s.yQ - n.yQ);
        return displayLight(gx, gy);
    };
    return [light(true), light(false)];
}
