package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xuanli27/octopus/internal/model"
	"github.com/xuanli27/octopus/internal/op"
	"github.com/xuanli27/octopus/internal/server/middleware"
	"github.com/xuanli27/octopus/internal/server/resp"
	"github.com/xuanli27/octopus/internal/server/router"
)

func init() {
	router.NewGroupRouter("/api/v1/public-models").
		Use(middleware.Auth()).
		AddRoute(router.NewRoute("", http.MethodGet).Handle(listPublicModels)).
		AddRoute(router.NewRoute("", http.MethodPost).Handle(createPublicModel).Use(middleware.RequireJSON())).
		AddRoute(router.NewRoute("/resolve", http.MethodPost).Handle(resolvePublicModels).Use(middleware.RequireJSON())).
		AddRoute(router.NewRoute("/pending", http.MethodGet).Handle(pendingPublicModels)).
		AddRoute(router.NewRoute("/seed", http.MethodPost).Handle(seedPublicModels)).
		AddRoute(router.NewRoute("/assign", http.MethodPost).Handle(assignPublicModelAlias).Use(middleware.RequireJSON())).
		AddRoute(router.NewRoute("/import", http.MethodPost).Handle(importPublicModels).Use(middleware.RequireJSON())).
		AddRoute(router.NewRoute("/export", http.MethodGet).Handle(exportPublicModels)).
		AddRoute(router.NewRoute("/:id", http.MethodPut).Handle(updatePublicModel).Use(middleware.RequireJSON())).
		AddRoute(router.NewRoute("/:id", http.MethodDelete).Handle(deletePublicModel))
}

func listPublicModels(c *gin.Context) {
	rows, err := op.PublicModelList(c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, rows)
}

func createPublicModel(c *gin.Context) {
	var req model.PublicModelCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}
	row, err := op.PublicModelCreate(&req, c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	resp.Success(c, row)
}

func updatePublicModel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		resp.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	var req model.PublicModelUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}
	req.ID = id
	row, err := op.PublicModelUpdate(&req, c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	resp.Success(c, row)
}

func deletePublicModel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		resp.Error(c, http.StatusBadRequest, "invalid id")
		return
	}
	if err := op.PublicModelDelete(id, c.Request.Context()); err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	resp.Success(c, nil)
}

type resolvePublicModelsRequest struct {
	Upstreams []string `json:"upstreams"`
}

func resolvePublicModels(c *gin.Context) {
	var req resolvePublicModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}
	rows, err := op.PublicModelResolveBatch(req.Upstreams, c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, rows)
}


func pendingPublicModels(c *gin.Context) {
	rows, err := op.PublicModelListPending(c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, rows)
}

func seedPublicModels(c *gin.Context) {
	n, err := op.PublicModelSeedCommon(c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, gin.H{"created": n})
}


type assignPublicModelRequest struct {
	Public string `json:"public" binding:"required"`
	Alias  string `json:"alias" binding:"required"`
}

func assignPublicModelAlias(c *gin.Context) {
	var req assignPublicModelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}
	row, err := op.PublicModelAssignAlias(req.Public, req.Alias, c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	resp.Success(c, row)
}


func exportPublicModels(c *gin.Context) {
	rows, err := op.PublicModelList(c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]model.PublicModelImportItem, 0, len(rows))
	for _, r := range rows {
		aliases := make([]string, 0, len(r.Aliases))
		for _, a := range r.Aliases {
			aliases = append(aliases, a.Alias)
		}
		en := r.Enabled
		out = append(out, model.PublicModelImportItem{
			Name:    r.Name,
			Note:    r.Note,
			Aliases: aliases,
			Enabled: &en,
		})
	}
	resp.Success(c, out)
}

type importPublicModelsRequest struct {
	Items []model.PublicModelImportItem `json:"items"`
}

func importPublicModels(c *gin.Context) {
	var req importPublicModelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}
	res, err := op.PublicModelImport(req.Items, c.Request.Context())
	if err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	resp.Success(c, res)
}
