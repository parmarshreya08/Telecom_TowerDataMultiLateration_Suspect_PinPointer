"""
Stage 1: Cheung & Lee (JPL) Pseudorange Multi-Lateration Algorithm
with Sector/Azimuth Arc Clipping, Bounding Box Constraints, & Robust NLOS Mitigation.

Formulation:
    rho_i = ||tower_i - [x, y]|| + b + e_i
where [x, y] is the 2D position and 'b' is the receiver clock bias in meters.

State Vector P = [x, y, b]^T (3x1 vector)
Matrix A = [-U_i, 1] (Nx3 matrix)
GDOP = sqrt(Tr((A^T A)^-1)) measures geometry quality.

Supports TA-band measurements: each tower provides an annular range (inner/outer)
derived from Timing Advance, with the midpoint used as the pseudorange and the
half-band width as the measurement uncertainty for inverse-variance weighting.

Ported from my_local_work/code/trilateration.py.
"""

import numpy as np

from app.localization.gis_utils import GISUtils
from app.localization.sector_wedge import centroid_of_intersection, make_sector_polygon


class JPLTrilateration:
    """
    Iterative least-squares trilateration with robust NLOS outlier mitigation.
    """

    def __init__(
        self,
        tower_coords: np.ndarray,
        azimuths: np.ndarray = None,
        beamwidths: np.ndarray = None,
    ):
        """
        :param tower_coords: Nx2 numpy array of (x, y) tower locations (projected UTM meters).
        :param azimuths: N array of sector boresight angles (degrees, 0 = North, 90 = East).
        :param beamwidths: N array of sector antenna beamwidth angles (degrees).
        """
        self.tower_coords = np.asarray(tower_coords, dtype=np.float64)
        self.N = len(self.tower_coords)
        if self.N < 3:
            raise ValueError("JPLTrilateration requires at least 3 tower reference points.")

        self.azimuths = np.asarray(azimuths, dtype=np.float64) if azimuths is not None else np.full(self.N, 60.0)
        self.beamwidths = np.asarray(beamwidths, dtype=np.float64) if beamwidths is not None else np.full(self.N, 60.0)

        min_x, min_y = np.min(self.tower_coords, axis=0) - 10000.0
        max_x, max_y = np.max(self.tower_coords, axis=0) + 10000.0
        self.bounds = (min_x, max_x, min_y, max_y)

    def estimate_position(
        self,
        pseudoranges: np.ndarray,
        uncertainties: np.ndarray = None,
        max_iterations: int = 10,
        tol: float = 1e-3,
        nlos_threshold: float = 80.0,
    ) -> dict:
        """
        Iteratively estimate target location P = [x, y, b] given measured pseudoranges.

        :param pseudoranges: N array of measured distances from towers (meters, including clock bias).
        :param uncertainties: N array of 1-sigma measurement uncertainty per tower (meters).
                              When provided, drives inverse-variance weighting and adaptive NLOS threshold.
                              When None, equal weights and fixed nlos_threshold are used.
        :param max_iterations: Maximum convergence iterations.
        :param tol: Convergence tolerance in meters.
        :param nlos_threshold: Base residual threshold in meters for Huber robust weighting.
        :return: dict containing position [x, y], clock_bias b, residual_rms, gdop, and uncertainties.
        """
        pseudoranges = np.maximum(np.asarray(pseudoranges, dtype=np.float64), 10.0)

        if uncertainties is not None:
            uncertainties = np.asarray(uncertainties, dtype=np.float64)
            uncertainties = np.maximum(uncertainties, 1.0)
        else:
            uncertainties = np.ones(self.N, dtype=np.float64) * nlos_threshold

        # Sector wedge intersection for initial guess
        sector_polys = [
            make_sector_polygon(
                self.tower_coords[i, 0], self.tower_coords[i, 1],
                pseudoranges[i], self.azimuths[i], self.beamwidths[i],
            )
            for i in range(self.N)
        ]
        sector_centroid = centroid_of_intersection(sector_polys)
        if sector_centroid is not None:
            P = np.array([sector_centroid[0], sector_centroid[1], 0.0], dtype=np.float64)
        else:
            # Fallback: use sector clipping centroid when no intersection exists
            initial_sector_centroid = GISUtils.compute_sector_clipping_centroid(
                self.tower_coords, pseudoranges, self.azimuths, self.beamwidths
            )
            P = np.array([initial_sector_centroid[0], initial_sector_centroid[1], 0.0], dtype=np.float64)

        base_nlos = nlos_threshold
        last_ATA_inv = np.eye(3, dtype=np.float64)

        min_x, max_x, min_y, max_y = self.bounds

        for iteration in range(max_iterations):
            pos_xy = P[:2]
            bias = P[2]

            diff = self.tower_coords - pos_xy
            dist_to_P = np.linalg.norm(diff, axis=1, keepdims=True)
            dist_to_P = np.maximum(dist_to_P, 1e-6)
            U = diff / dist_to_P

            A = np.hstack([-U, np.ones((self.N, 1), dtype=np.float64)])

            inv_uncertainties = 1.0 / uncertainties
            W = np.diag(inv_uncertainties ** 2)
            WA = W @ A

            try:
                last_ATA_inv = np.linalg.inv(A.T @ WA)
                M = last_ATA_inv @ WA.T
            except np.linalg.LinAlgError:
                last_ATA_inv = np.linalg.pinv(A.T @ WA)
                M = last_ATA_inv @ WA.T

            computed_pseudorange = dist_to_P.flatten() + bias
            d = pseudoranges - computed_pseudorange

            adaptive_threshold = base_nlos * (uncertainties / np.median(uncertainties))
            abs_residuals = np.abs(d)
            weights = np.where(abs_residuals > adaptive_threshold, adaptive_threshold / abs_residuals, 1.0)

            # Combine Huber robust weights with uncertainty weighting (fix: apply on top of WA, not raw A)
            WA_weighted = weights[:, None] * WA
            try:
                last_ATA_inv = np.linalg.inv(A.T @ WA_weighted)
                M = last_ATA_inv @ WA_weighted.T
            except np.linalg.LinAlgError:
                last_ATA_inv = np.linalg.pinv(A.T @ WA_weighted)
                M = last_ATA_inv @ WA_weighted.T

            delta_P = M @ d
            P += delta_P

            P[0] = np.clip(P[0], min_x, max_x)
            P[1] = np.clip(P[1], min_y, max_y)
            P[2] = np.clip(P[2], -1000.0, 1000.0)

            if np.linalg.norm(delta_P) < tol:
                break

        gdop = np.sqrt(max(1e-8, np.trace(last_ATA_inv)))

        final_computed = np.linalg.norm(self.tower_coords - P[:2], axis=1) + P[2]
        final_residuals = pseudoranges - final_computed
        residual_rms = np.sqrt(np.mean(final_residuals ** 2))

        return {
            "position": P[:2],
            "clock_bias": P[2],
            "residual_rms": residual_rms,
            "gdop": gdop,
            "uncertainties": uncertainties,
        }


if __name__ == "__main__":
    towers = np.array([[0.0, 0.0], [0.0, 100.0], [100.0, 0.0], [100.0, 100.0]])
    solver = JPLTrilateration(towers)
    true_pos = np.array([50.0, 50.0])
    pr = np.linalg.norm(towers - true_pos, axis=1) + 10.0
    unc = np.full(4, 20.0)
    res = solver.estimate_position(pr, uncertainties=unc)
    err = np.linalg.norm(res["position"] - true_pos)
    assert err < 5.0, f"trilateration error too large: {err:.2f}m"
    assert abs(res["clock_bias"] - 10.0) < 5.0, f"bias error: {res['clock_bias']:.2f}"
    assert res["gdop"] > 0
    assert res["residual_rms"] < 20.0
    print(f"trilateration.py self-test OK (error={err:.2f}m, bias={res['clock_bias']:.2f}m, gdop={res['gdop']:.2f})")
